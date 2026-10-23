import React, { useCallback, useEffect, useMemo, useState } from "react";
import moment from "moment-timezone";
import { Icon } from "@iconify/react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { getAllBookings } from "../api/getAllBookings";

/*
 * This component deliberately uses the same getAllBookings() call that powers
 * the All Bookings screen. It does not add a new API helper or stored procedure.
 */
const PORTAL_TIMEZONE = "Asia/Dubai";
const ITEMS_PER_PAGE = 10;
const DATE_TIME_FORMATS = [
    "YYYY-MM-DD HH:mm:ss",
    "YYYY-MM-DD HH:mm",
    "YYYY/MM/DD HH:mm:ss",
    "YYYY/MM/DD HH:mm",
    "DD-MM-YYYY HH:mm:ss",
    "DD-MM-YYYY HH:mm",
    "DD/MM/YYYY HH:mm:ss",
    "DD/MM/YYYY HH:mm",
    moment.ISO_8601,
];

const norm = (value) => String(value ?? "").trim().toLowerCase();

const hasValue = (value) => value !== undefined && value !== null && value !== "";

const firstValue = (source, keys, fallback = "") => {
    for (const key of keys) {
        if (hasValue(source?.[key])) return source[key];
    }

    return fallback;
};

/* getAllBookings can return contact fields directly or inside one of these
 * joined user/detail objects, depending on the current backend query. */
const getContactSources = (item) =>
    [
        item,
        item?.student,
        item?.student_user,
        item?.studentUser,
        item?.user,
        item?.account,
        item?.student_detail,
        item?.studentDetail,
        item?.studentdetail,
        item?.user_detail,
        item?.userDetail,
        item?.userdetail,
        item?.userdetails,
    ].filter((source) => source && typeof source === "object");

const getContactValue = (item, keys, fallback = "") => {
    for (const source of getContactSources(item)) {
        const value = firstValue(source, keys);
        if (hasValue(value)) return value;
    }

    return fallback;
};

const unique = (values) => [
    ...new Set(values.map((value) => String(value || "").trim()).filter(Boolean)),
];

const toList = (value) => {
    if (!hasValue(value)) return [];
    if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);

    return String(value)
        .split(/[|,;]+/)
        .map((item) => item.trim())
        .filter(Boolean);
};

const titleCase = (value) =>
    String(value || "-")
        .replace(/[_-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/\b\w/g, (letter) => letter.toUpperCase());

const isGroupBooking = (item) => Number(item?.is_group_booking || 0) === 1;

const getGroupRole = (item) => norm(item?.group_user_role).replace(/[\s-]+/g, "_");

const isAssistantTeacherRow = (item) => getGroupRole(item) === "assistant_teacher";

const getStudentTimezone = (item) => {
    const timezone = firstValue(item, [
        "studentTime_zone",
        "student_timezone",
        "studentTimezone",
        "timezone_location",
        "timezone",
    ]);

    return moment.tz.zone(timezone) ? timezone : PORTAL_TIMEZONE;
};

const getBookDateValue = (item) =>
    firstValue(item, ["bookdate", "booking_date", "group_session_date"]);

const getSlotStartValue = (item) =>
    firstValue(item, ["slot_start", "booking_start_time", "group_session_start"]);

const getSlotEndValue = (item) =>
    firstValue(item, ["slot_end", "booking_end_time", "group_session_end"]);

const getBookingId = (item) => firstValue(item, ["bookingid", "booking_id", "id"]);

const getSubjectName = (item) =>
    String(
        firstValue(item, [
            "subjectname",
            "subject_name",
            "group_subject_name",
            "group_subjectname",
            "subject",
        ])
    ).trim() || "No subject";

const getTeacherName = (item) =>
    String(
        item?._group_main_teacher?.name ||
        firstValue(item, ["teachername", "teacher_name", "teacher_fullname"])
    ).trim() || "No teacher";

const getSessionTypeKey = (value) => {
    const sessionType = norm(value).replace(/[_-]+/g, " ").replace(/\s+/g, " ");
    if (sessionType === "in person") return "in-person";
    if (sessionType === "online") return "online";
    return sessionType || "online";
};

const getSessionTypeDisplay = (value) =>
    getSessionTypeKey(value) === "in-person" ? "In-Person" : "Online";

const normalizeRecordingUrl = (value) => String(value || "").replace(/\\\//g, "/").trim();

const hasRecordingUrl = (item) => Boolean(normalizeRecordingUrl(item?.recording_s3_url));

/* Performance can arrive as an id, an object or a populated text/status field.
 * A 0/null/false value is not treated as proof of completion. */
const hasMeaningfulCompletionValue = (value) => {
    if (!hasValue(value) || value === false || value === 0) return false;
    if (typeof value === "string") {
        return !["0", "false", "null", "undefined", "no"].includes(norm(value));
    }
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "object") return Object.keys(value).length > 0;
    return true;
};

const hasPerformance = (item) =>
    [
        "has_teacher_feedback",
        "performance",
        "performance_id",
        "performanceid",
        "performance_status",
        "performance_feedback",
        "teacher_performance",
        "teacher_performance_id",
        "teacher_performance_status",
        "group_performance",
        "group_performance_id",
        "group_performanceid",
        "group_performance_status",
        "group_performance_feedback",
        "group_performance_feedback_id",
        "groupperformance",
        "groupperformance_id",
        "groupperformance_status",
        "has_group_feedback",
        "hasGroupFeedback",
        "group_feedback",
        "group_feedback_id",
        "groupFeedbackId",
        "group_session_feedback",
        "group_session_feedback_id",
        "feedback_id",
    ].some((key) => hasMeaningfulCompletionValue(item?.[key]));

const hasCompletionEvidence = (item) =>
    hasMeaningfulCompletionValue(item?.has_completion_evidence) ||
    hasRecordingUrl(item) ||
    hasPerformance(item);

/*
 * bookteacher dates are stored in the student's booking timezone. Group
 * session fallback fields are already Asia/Dubai. This is the same rule used
 * in All Bookings, so the tracker and booking list show the same time.
 */
const parseBookingDateTime = (item, type = "start") => {
    const dateValue = getBookDateValue(item);
    const timeValue = type === "end" ? getSlotEndValue(item) : getSlotStartValue(item);

    if (!dateValue) return null;

    const hasBookteacherDateTime = Boolean(item?.bookdate) && Boolean(timeValue);
    const sourceTimezone =
        isGroupBooking(item) && !hasBookteacherDateTime
            ? PORTAL_TIMEZONE
            : getStudentTimezone(item);
    const dateTimeValue = timeValue ? `${dateValue} ${timeValue}` : String(dateValue);

    let parsed = moment.tz(dateTimeValue, DATE_TIME_FORMATS, true, sourceTimezone);
    if (!parsed.isValid()) parsed = moment.tz(dateTimeValue, DATE_TIME_FORMATS, sourceTimezone);

    return parsed.isValid() ? parsed.tz(PORTAL_TIMEZONE) : null;
};

const getEndMoment = (item, startMoment) => {
    const endMoment = parseBookingDateTime(item, "end");
    return endMoment?.isValid() ? endMoment : startMoment?.clone().add(1, "hour") || null;
};

const formatMoment = (value) => (value?.isValid?.() ? value.format("DD MMM YYYY | hh:mm A") : "-");

const formatTimeRange = (startMoment, endMoment) => {
    if (!startMoment?.isValid?.()) return "-";
    const date = startMoment.format("DD MMM YYYY");
    const start = startMoment.format("hh:mm A");
    const end = endMoment?.isValid?.() ? ` - ${endMoment.format("hh:mm A")}` : "";
    return `${date} | ${start}${end}`;
};

const getBookingKey = (item) => {
    const studentKey = firstValue(item, ["studentid", "student_id", "studentname", "student_email"], "na");
    const date = getBookDateValue(item) || "na";
    const start = getSlotStartValue(item) || "na";

    if (isGroupBooking(item)) {
        const liveSessionKey =
            firstValue(item, ["group_live_session_id", "group_session_id"]) ||
            `${date}|${start}|${getSubjectName(item)}`;

        return [
            "group",
            firstValue(item, ["group_programme_id"], "na"),
            firstValue(item, ["group_batch_id"], "na"),
            liveSessionKey,
            studentKey,
        ].join("|");
    }

    return [
        "one-to-one",
        getBookingId(item) || "na",
        date,
        start,
        getTeacherName(item),
        studentKey,
    ].join("|");
};

/* Group sessions return one row per teacher. Keep the main teacher's row and
 * carry related rows for completion-evidence checks. */
const consolidateBookings = (list) => {
    const oneToOneRows = new Map();
    const groupRows = new Map();

    (list || []).forEach((item) => {
        const key = getBookingKey(item);

        if (!isGroupBooking(item)) {
            if (!oneToOneRows.has(key)) oneToOneRows.set(key, item);
            return;
        }

        if (!groupRows.has(key)) groupRows.set(key, { rows: [], mainRow: null });
        const group = groupRows.get(key);
        group.rows.push(item);

        if (!group.mainRow && !isAssistantTeacherRow(item)) group.mainRow = item;
    });

    const consolidatedGroups = Array.from(groupRows.values()).map((group) => {
        const baseRow = group.mainRow || group.rows[0] || {};
        const recordingRow = group.rows.find((row) => hasRecordingUrl(row));

        return {
            ...baseRow,
            recording_s3_url: recordingRow?.recording_s3_url || baseRow?.recording_s3_url || "",
            _group_related_rows: group.rows,
            _group_main_teacher: {
                id: group.mainRow?.teacherid || baseRow?.teacherid || "",
                name: group.mainRow?.teachername || baseRow?.teachername || "",
            },
        };
    });

    return [...oneToOneRows.values(), ...consolidatedGroups];
};

const isCancelledBooking = (item) => {
    const bookingCancelled =
        Number(firstValue(item, ["is_cancelled", "isCancelled"], 0)) === 1;

    const groupCancelled =
        isGroupBooking(item) &&
        norm(firstValue(item, ["group_session_status", "groupSessionStatus"])) === "cancelled";

    // A cancelled group session alone must not mark an
    // existing student booking as cancelled.
    // Only an explicitly cancelled booking is cancelled.
    return bookingCancelled || (
        groupCancelled && !hasValue(getBookingId(item))
    );
};

/* All Bookings already supplies this value for in-person lessons.  Keep it
 * as the first source of truth, including the old `incomplete` value. */
const getInPersonDbStatus = (item) => {
    const status = norm(firstValue(item, ["inperson_status", "inPersonStatus"]));

    if (status === "upcoming") return "upcoming";
    if (status === "ongoing") return "ongoing";
    if (["completed", "complete"].includes(status)) return "completed";
    if (["cancelled", "canceled"].includes(status)) return "cancelled";
    if (["missed", "incomplete", "not completed", "not_completed"].includes(status)) return "missed";

    return "";
};

const getResolvedInPersonStatus = (item) => {
    if (getSessionTypeKey(item?.session_type) !== "in-person") return "";

    const relatedRows = item?._group_related_rows?.length ? item._group_related_rows : [];
    return [item, ...relatedRows]
        .map(getInPersonDbStatus)
        .find(Boolean) || "";
};

/*
 * Tracker rule requested for both normal and group sessions:
 * In-person manual status from All Bookings is authoritative when present.
 * Past lesson + recording/performance/group feedback = Completed.
 * Past lesson without that proof = Missed.
 * Cancelled bookings remain in full history, but do not affect lesson totals,
 * last lesson, next lesson, or missed/completed calculations.
 */
const getBookingStatus = (item, now = moment.tz(PORTAL_TIMEZONE)) => {
    const startMoment = parseBookingDateTime(item, "start");
    const endMoment = getEndMoment(item, startMoment);
    const relatedRows = item?._group_related_rows?.length ? item._group_related_rows : [item];
    const inPersonDbStatus = getResolvedInPersonStatus(item);
    const hasEvidence = isGroupBooking(item)
        ? relatedRows.some(hasCompletionEvidence)
        : hasCompletionEvidence(item);

    if (isCancelledBooking(item)) return "cancelled";
    if (inPersonDbStatus) return inPersonDbStatus;
    if (!startMoment?.isValid?.()) return "upcoming";
    if (now.isBefore(startMoment)) return "upcoming";
    if (endMoment?.isValid?.() && now.isSameOrBefore(endMoment)) return "ongoing";

    // Same fallback as All Bookings for past In-Person lessons.
    if (getSessionTypeKey(item?.session_type) === "in-person") return "completed";

    return hasEvidence ? "completed" : "missed";
};

const getSourceLabel = (item) => {
    const sourceValues = unique(
        [item?.booking_source, item?.bookingsource, item?.booking_type, item?.bookingtype]
            .flatMap(toList)
            .filter(Boolean)
    );

    const mapped = sourceValues.map((source) => {
        const value = norm(source);
        if (value === "manual" || value === "portal") return "Manual";
        if (value === "web app" || value === "website") return "Web App";
        return source;
    });

    return unique(mapped).join(", ") || "-";
};

const getBookingCategory = (item) => (isGroupBooking(item) ? "Group" : "One-to-One");

const PAYMENT_STATUS_ORDER = ["Paid", "Free", "Pending", "Unpaid", "Failed", "Refunded"];

const normalizePaymentStatus = (value) => {
    const status = norm(value).replace(/[\s-]+/g, "_");

    if (["paid", "success", "successful", "completed"].includes(status)) return "Paid";
    if (["free", "complimentary"].includes(status)) return "Free";
    if (["pending", "processing", "initiated"].includes(status)) return "Pending";
    if (["failed", "declined"].includes(status)) return "Failed";
    if (["refunded", "partially_refunded", "partial_refund"].includes(status)) return "Refunded";
    if (["unpaid", "not_paid", "due"].includes(status)) return "Unpaid";

    return "";
};

const getPaymentStatus = (item) => {
    const bookingPaymentStatus = normalizePaymentStatus(
        firstValue(item, ["payment_status", "paymentStatus"])
    );
    const groupPaymentStatus = normalizePaymentStatus(
        firstValue(item, ["group_payment_status", "groupPaymentStatus"])
    );

    // Same precedence as All Bookings: the booking value wins, except a
    // group-level failed/refunded transaction. This keeps Free + pending
    // group rows labelled Free instead of incorrectly showing Unpaid.
    if (["Failed", "Refunded"].includes(groupPaymentStatus)) return groupPaymentStatus;

    return bookingPaymentStatus || groupPaymentStatus || "Unpaid";
};

const getPaymentStatusPriority = (status) => {
    const priority = {
        Failed: 6,
        Refunded: 5,
        Paid: 4,
        Free: 3,
        Pending: 2,
        Unpaid: 1,
    };

    return priority[status] || 0;
};

const getPaymentStatusMeta = (status) => {
    if (status === "Paid") return { label: "Paid", className: "sbtw-status-success" };
    if (status === "Free") return { label: "Free", className: "sbtw-status-primary" };
    if (status === "Pending") return { label: "Pending", className: "sbtw-status-warning" };
    if (status === "Failed") return { label: "Failed", className: "sbtw-status-danger" };
    if (status === "Refunded") return { label: "Refunded", className: "sbtw-status-neutral" };
    return { label: "Unpaid", className: "sbtw-status-danger" };
};

const getPaymentTrackingKey = (item) => {
    const groupPaymentId = String(
        firstValue(item, ["group_payment_id", "groupPaymentId"]) || ""
    ).trim();

    if (isGroupBooking(item) && groupPaymentId) {
        return `group-payment:${groupPaymentId}`;
    }

    return `booking-payment:${getBookingId(item) || getBookingKey(item)}`;
};

const getStudentDetails = (item) => ({
    id: getContactValue(item, ["studentid", "student_id", "studentId", "student_user_id"]),
    name:
        String(getContactValue(item, ["studentname", "student_name", "student_fullname", "fullname", "name"])).trim() ||
        "Unknown student",
    username: String(getContactValue(item, ["student_username", "studentusername", "username", "user_name", "account_username"])).trim(),
    email: String(getContactValue(item, ["student_email", "studentemail", "studentEmail", "email", "useremail", "account_email", "detail_email", "detailemail"])).trim(),
    parentEmails: unique(
        getContactSources(item).flatMap((source) =>
            [
                "parentemail",
                "parent_email",
                "parentEmail",
                "parent_email_address",
                "parentcontactemail",
                "guardian_email",
                "detail_parent_email",
                "detailparentemail",
                "account_parent_email",
            ].flatMap((key) => toList(source?.[key]))
        )
    ),
    parentPhone: String(getContactValue(item, [
        "parentphone",
        "parent_phone",
        "parentPhone",
        "parent_contact_number",
        "parentcontactnumber",
        "parent_phone_no",
        "parentphone_number",
        "guardian_phone",
        "phone",
        "phonenumber",
        "mobile",
        "contactnumber",
        "detail_phone",
        "detailphone",
        "account_phone",
        "recoveryphonenumber",
    ])).trim(),
});

const mergeStudentDetails = (items) =>
    (items || []).map(getStudentDetails).reduce(
        (merged, current) => ({
            id: merged.id || current.id,
            name: merged.name !== "Unknown student" ? merged.name : current.name,
            username: merged.username || current.username,
            email: merged.email || current.email,
            parentEmails: unique([...merged.parentEmails, ...current.parentEmails]),
            parentPhone: merged.parentPhone || current.parentPhone,
        }),
        {
            id: "",
            name: "Unknown student",
            username: "",
            email: "",
            parentEmails: [],
            parentPhone: "",
        }
    );

const getStatusMeta = (status) => {
    if (status === "upcoming") return { label: "Upcoming", className: "sbtw-status-success" };
    if (status === "ongoing") return { label: "Ongoing", className: "sbtw-status-info" };
    if (status === "completed") return { label: "Completed", className: "sbtw-status-primary" };
    if (status === "missed") return { label: "Missed", className: "sbtw-status-danger" };
    if (status === "cancelled") return { label: "Cancelled", className: "sbtw-status-neutral" };
    return { label: titleCase(status), className: "sbtw-status-neutral" };
};

const createSummaryBucket = () => ({
    totalBookings: 0,
    completedLessons: 0,
    missedLessons: 0,
    cancelledLessons: 0,
    upcomingLessons: 0,
    ongoingLessons: 0,
    lastMoment: null,
    nextMoment: null,
});

const addBookingToSummary = (summary, status, startMoment, endMoment, now) => {
    summary.totalBookings += 1;

    if (status === "cancelled") {
        summary.cancelledLessons += 1;
        return;
    }

    if (status === "completed") summary.completedLessons += 1;
    if (status === "missed") summary.missedLessons += 1;
    if (status === "ongoing") summary.ongoingLessons += 1;

    if (status === "upcoming") {
        summary.upcomingLessons += 1;
        if (startMoment?.isValid?.() && (!summary.nextMoment || startMoment.isBefore(summary.nextMoment))) {
            summary.nextMoment = startMoment.clone();
        }
    }

    const finishedAt = endMoment?.isValid?.() ? endMoment : startMoment;
    if (finishedAt?.isValid?.() && now.isAfter(finishedAt) && (!summary.lastMoment || finishedAt.isAfter(summary.lastMoment))) {
        summary.lastMoment = finishedAt.clone();
    }
};

/*
 * One row per student. The breakdown is deliberately one row per subject,
 * not one row per subject/teacher pair. A student's latest non-cancelled
 * lesson for a subject decides which teacher is displayed as the current
 * teacher for that subject.
 */
const buildTrackerRows = (rawRows) => {
    const now = moment.tz(PORTAL_TIMEZONE);
    const rowsByStudent = new Map();

    consolidateBookings(rawRows).forEach((item) => {
        const studentRows = item?._group_related_rows?.length ? item._group_related_rows : [item];
        const student = mergeStudentDetails(studentRows);
        const subjectId = firstValue(item, ["subjectid", "subject_id", "group_subject_id"]);
        const subjectName = getSubjectName(item);
        const teacherId = firstValue(item, ["teacherid", "teacher_id"]);
        const teacherName = getTeacherName(item);
        const rowKey = String(student.id || student.email || student.name).trim();
        const subjectKey = String(subjectId || subjectName).trim();
        const teacherKey = String(teacherId || teacherName).trim();
        const breakdownKey = subjectKey;
        const startMoment = parseBookingDateTime(item, "start");
        const endMoment = getEndMoment(item, startMoment);
        const status = getBookingStatus(item, now);

        if (!rowsByStudent.has(rowKey)) {
            rowsByStudent.set(rowKey, {
                rowKey,
                student,
                ...createSummaryBucket(),
                bookingTypes: new Set(),
                sessionTypes: new Set(),
                bookingSources: new Set(),
                paymentMap: new Map(),
                subjectsMap: new Map(),
                teachersMap: new Map(),
                breakdownMap: new Map(),
                history: [],
            });
        }

        const row = rowsByStudent.get(rowKey);
        // Some rows have an empty contact field while another booking has it.
        if (!row.student.email && student.email) row.student.email = student.email;
        if (!row.student.username && student.username) row.student.username = student.username;
        if (!row.student.parentPhone && student.parentPhone) row.student.parentPhone = student.parentPhone;
        row.student.parentEmails = unique([...row.student.parentEmails, ...student.parentEmails]);

        if (!row.subjectsMap.has(subjectKey)) row.subjectsMap.set(subjectKey, { value: subjectKey, label: subjectName });
        if (!row.teachersMap.has(teacherKey)) row.teachersMap.set(teacherKey, { value: teacherKey, label: teacherName });
        if (!row.breakdownMap.has(breakdownKey)) {
            row.breakdownMap.set(breakdownKey, {
                key: breakdownKey,
                subjectId,
                subjectName,
                teacherId,
                teacherName,
                latestTeacherMoment: null,
                latestTeacherStatus: "",
                ...createSummaryBucket(),
            });
        }

        const log = {
            key: `${getBookingKey(item)}|${row.history.length}`,
            bookingId: getBookingId(item),
            subjectName,
            teacherName,
            startMoment,
            endMoment,
            bookingType: getBookingCategory(item),
            sessionType: getSessionTypeDisplay(item?.session_type),
            source: getSourceLabel(item),
            paymentStatus: getPaymentStatus(item),
            paymentKey: getPaymentTrackingKey(item),
            status,
            programme: String(firstValue(item, ["group_programme_name"])).trim(),
            batch: String(firstValue(item, ["group_batch_label", "group_batch_id"])).trim(),
            sessionTitle: String(firstValue(item, ["group_session_title"])).trim(),
        };

        row.history.push(log);
        const previousPaymentStatus = row.paymentMap.get(log.paymentKey);
        if (
            !previousPaymentStatus ||
            getPaymentStatusPriority(log.paymentStatus) > getPaymentStatusPriority(previousPaymentStatus)
        ) {
            row.paymentMap.set(log.paymentKey, log.paymentStatus);
        }
        row.bookingTypes.add(log.bookingType);
        row.sessionTypes.add(log.sessionType);
        if (log.source !== "-") row.bookingSources.add(log.source);
        addBookingToSummary(row, status, startMoment, endMoment, now);
        const subjectSummary = row.breakdownMap.get(breakdownKey);
        addBookingToSummary(subjectSummary, status, startMoment, endMoment, now);

        /*
         * Cancelled bookings do not replace a student's current teacher.
         * If all available bookings are cancelled, retain the newest known
         * teacher rather than leaving the subject blank.
         */
        const hasValidLessonTime = startMoment?.isValid?.();
        const currentTeacherIsCancelled =
            subjectSummary.latestTeacherStatus === "cancelled";

        const shouldUpdateCurrentTeacher =
            hasValidLessonTime && (
                !subjectSummary.latestTeacherMoment ||
                (
                    status !== "cancelled" &&
                    (
                        currentTeacherIsCancelled ||
                        startMoment.isAfter(subjectSummary.latestTeacherMoment)
                    )
                ) ||
                (
                    status === "cancelled" &&
                    currentTeacherIsCancelled &&
                    startMoment.isAfter(subjectSummary.latestTeacherMoment)
                )
            );

        if (shouldUpdateCurrentTeacher) {
            subjectSummary.teacherId = teacherId;
            subjectSummary.teacherName = teacherName;
            subjectSummary.latestTeacherMoment = startMoment.clone();
            subjectSummary.latestTeacherStatus = status;
        }
    });

    return Array.from(rowsByStudent.values())
        .filter((row) => row.totalBookings > 0)
        .map((row) => {
            const daysSince = row.lastMoment
                ? now.clone().startOf("day").diff(row.lastMoment.clone().startOf("day"), "days")
                : null;
            const status = row.ongoingLessons
                ? "Lesson ongoing"
                : row.upcomingLessons
                    ? "Upcoming scheduled"
                    : "No upcoming lesson";
            const history = row.history.sort((first, second) => {
                const firstTime = first.startMoment?.valueOf?.() || 0;
                const secondTime = second.startMoment?.valueOf?.() || 0;
                return secondTime - firstTime;
            });
            const paymentCounts = [...row.paymentMap.values()].reduce((summary, paymentStatus) => {
                summary[paymentStatus] = (summary[paymentStatus] || 0) + 1;
                return summary;
            }, PAYMENT_STATUS_ORDER.reduce((summary, status) => ({ ...summary, [status]: 0 }), {}));

            const breakdown = Array.from(row.breakdownMap.values())
                .filter((item) => item.totalBookings > 0)
                .map((item) => ({
                    ...item,
                    needsRebooking: item.upcomingLessons === 0,
                }))
                .sort((first, second) => first.subjectName.localeCompare(second.subjectName));

            const currentTeachers = unique(
                breakdown.map((item) => item.teacherName)
            ).map((name) => ({ value: name, label: name }));

            const needsRebookingSubjects = breakdown.filter(
                (item) => item.needsRebooking
            );

            return {
                ...row,
                subjects: Array.from(row.subjectsMap.values()).sort((a, b) => a.label.localeCompare(b.label)),
                teachers: currentTeachers,
                breakdown,
                needsRebookingSubjects,
                bookingTypes: [...row.bookingTypes].sort(),
                sessionTypes: [...row.sessionTypes].sort(),
                bookingSources: [...row.bookingSources].sort(),
                paymentCounts,
                paidPayments: paymentCounts.Paid,
                freePayments: paymentCounts.Free,
                unpaidPayments: paymentCounts.Unpaid,
                daysSince,
                status,
                history,
                upcomingSchedule: history
                    .filter((item) => item.status === "upcoming" && item.startMoment?.isValid?.())
                    .sort((first, second) => first.startMoment.valueOf() - second.startMoment.valueOf()),
            };
        })
        .sort((first, second) => {
            if (first.nextMoment && second.nextMoment) return first.nextMoment.valueOf() - second.nextMoment.valueOf();
            if (first.nextMoment) return -1;
            if (second.nextMoment) return 1;
            return (second.lastMoment?.valueOf?.() || 0) - (first.lastMoment?.valueOf?.() || 0);
        });
};

const extractRows = (response) => {
    const candidates = [
        response,
        response?.data,
        response?.data?.data,
        response?.getall_bookings,
        response?.getallbookings,
        response?.data?.getall_bookings,
        response?.data?.getallbookings,
    ];

    return candidates.find(Array.isArray) || [];
};

const SummaryCard = ({ icon, label, value, tone }) => (
    <div className="col-xl-3 col-md-6">
        <div className="sbtw-stat-card h-100">
            <span className={`sbtw-stat-icon ${tone}`}><Icon icon={icon} /></span>
            <div>
                <span className="sbtw-stat-label">{label}</span>
                <strong className="sbtw-stat-value">{value}</strong>
            </div>
        </div>
    </div>
);

const StatusBadge = ({ status }) => {
    const statusValue = norm(status);
    let className = "sbtw-status-neutral";
    if (statusValue.includes("upcoming")) className = "sbtw-status-success";
    if (statusValue.includes("ongoing")) className = "sbtw-status-info";
    if (statusValue.includes("cancel")) className = "sbtw-status-neutral";
    if (statusValue.includes("review") || statusValue.includes("no upcoming")) className = "sbtw-status-warning";

    return <span className={`sbtw-status ${className}`}>{status}</span>;
};

const HorizontalScrollHint = () => (
    <div className="sbtw-scroll-hint" aria-hidden="true">
        <Icon icon="mdi:arrow-left-right-bold-outline" />
        <span>Use the bottom scroll bar to view all columns</span>
    </div>
);

const BookingLogsModal = ({ row, onClose }) => {
    if (!row) return null;

    const upcomingByDay = [];
    row.upcomingSchedule.forEach((item) => {
        const dayKey = item.startMoment.format("YYYY-MM-DD");
        const existingDay = upcomingByDay.find((day) => day.key === dayKey);
        if (existingDay) {
            existingDay.items.push(item);
        } else {
            upcomingByDay.push({
                key: dayKey,
                label: item.startMoment.format("dddd, DD MMM YYYY"),
                items: [item],
            });
        }
    });

    return (
        <div className="sbtw-modal-backdrop" role="presentation" onMouseDown={onClose}>
            <div
                className="sbtw-modal"
                role="dialog"
                aria-modal="true"
                aria-label="Student booking details"
                onMouseDown={(event) => event.stopPropagation()}
            >
                <div className="sbtw-modal-header">
                    <div>
                        <h5 className="mb-1">Student Booking Details</h5>
                        <p className="sbtw-muted mb-0">
                            {row.student.name} · {row.subjects.length} subjects · {row.teachers.length} current teachers
                        </p>
                    </div>
                    <button type="button" className="sbtw-close-button" onClick={onClose} aria-label="Close details">
                        <Icon icon="mdi:close" />
                    </button>
                </div>

                <div className="sbtw-modal-body">
                    <div className="row g-3 mb-4">
                        <div className="col-xl-3 col-md-6">
                            <div className="sbtw-detail-card">
                                <span className="sbtw-detail-label">Parent email</span>
                                <strong>{row.student.parentEmails.join(", ") || "Not available"}</strong>
                            </div>
                        </div>
                        <div className="col-xl-3 col-md-6">
                            <div className="sbtw-detail-card">
                                <span className="sbtw-detail-label">Parent phone</span>
                                <strong>{row.student.parentPhone || "Not available"}</strong>
                            </div>
                        </div>
                        <div className="col-xl-3 col-md-6">
                            <div className="sbtw-detail-card">
                                <span className="sbtw-detail-label">Total lessons</span>
                                <strong>{row.totalBookings}</strong>
                                <small className="sbtw-muted">{row.completedLessons} completed</small>
                            </div>
                        </div>
                        <div className="col-xl-3 col-md-6">
                            <div className="sbtw-detail-card">
                                <span className="sbtw-detail-label">Upcoming</span>
                                <strong className="text-success">{row.upcomingLessons}</strong>
                                <small className="sbtw-muted">{row.missedLessons} missed</small>
                            </div>
                        </div>
                    </div>

                    <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
                        <div>
                            <h6 className="mb-1">Subject coverage and current teacher</h6>
                            <p className="sbtw-muted small mb-0">Only the latest teacher for each subject is displayed here.</p>
                        </div>
                        <div className="d-flex flex-wrap gap-1">
                            {PAYMENT_STATUS_ORDER.map((paymentStatus) => {
                                const count = row.paymentCounts[paymentStatus] || 0;
                                const paymentMeta = getPaymentStatusMeta(paymentStatus);

                                return count > 0 ? (
                                    <span key={paymentStatus} className={`sbtw-status ${paymentMeta.className}`}>
                                        {count} {paymentMeta.label}
                                    </span>
                                ) : null;
                            })}
                            {row.bookingTypes.map((type) => <span key={type} className="sbtw-chip">{type}</span>)}
                            {row.sessionTypes.map((type) => <span key={type} className="sbtw-chip">{type}</span>)}
                            {row.bookingSources.map((source) => <span key={source} className="sbtw-chip">{source}</span>)}
                        </div>
                    </div>

                    {row.needsRebookingSubjects.length ? (
                        <div className="sbtw-rebook-panel mb-3">
                            <Icon icon="mdi:alert-circle-outline" />
                            <span>
                                Needs rebooking: {row.needsRebookingSubjects.map((item) => item.subjectName).join(", ")}
                            </span>
                        </div>
                    ) : null}

                    <HorizontalScrollHint />
                    <div className="table-responsive sbtw-modal-table-wrap mb-4">
                        <table className="table bordered-table mb-0 sbtw-table">
                            <thead>
                                <tr>
                                    <th>Subject</th>
                                    <th>Current Teacher</th>
                                    <th className="text-center">Total</th>
                                    <th className="text-center">Upcoming</th>
                                    <th>Coverage</th>
                                    <th>Last Lesson</th>
                                    <th>Next Lesson</th>
                                </tr>
                            </thead>
                            <tbody>
                                {row.breakdown.map((item) => (
                                    <tr key={item.key}>
                                        <td>{item.subjectName}</td>
                                        <td>{item.teacherName}</td>
                                        <td className="text-center">{item.totalBookings}</td>
                                        <td className="text-center">{item.upcomingLessons}</td>
                                        <td>
                                            {item.needsRebooking ? (
                                                <span className="sbtw-status sbtw-status-danger">Needs Rebooking</span>
                                            ) : (
                                                <span className="sbtw-status sbtw-status-success">Covered</span>
                                            )}
                                        </td>
                                        <td>{formatMoment(item.lastMoment)}</td>
                                        <td>{formatMoment(item.nextMoment)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
                        <div>
                            <h6 className="mb-1">Upcoming plan</h6>
                        </div>
                    </div>

                    {upcomingByDay.length ? (
                        <div className="sbtw-schedule-list mb-4">
                            {upcomingByDay.map((day) => (
                                <div key={day.key} className="sbtw-schedule-day">
                                    <div className="sbtw-schedule-date">{day.label}</div>
                                    {day.items.map((item) => (
                                        <div key={item.key} className="sbtw-schedule-item">
                                            <span className="sbtw-schedule-time">
                                                {item.startMoment.format("hh:mm A")}{item.endMoment?.isValid?.() ? ` - ${item.endMoment.format("hh:mm A")}` : ""}
                                            </span>
                                            <div>
                                                <strong>{item.subjectName}</strong>
                                                <small className="sbtw-muted d-block">{item.teacherName} · {item.sessionType} · {item.bookingType}</small>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ))}
                        </div>
                    ) : <div className="sbtw-empty mb-4">No upcoming sessions are scheduled for this student.</div>}

                    <div className="mb-3">
                        <h6 className="mb-1">Full booking history</h6>
                    </div>

                    <div className="sbtw-history-list">
                        {row.history.map((item) => {
                            const statusMeta = getStatusMeta(item.status);
                            const paymentMeta = getPaymentStatusMeta(item.paymentStatus);
                            const groupDetail = [item.programme, item.batch, item.sessionTitle].filter(Boolean).join(" · ");

                            return (
                                <article key={item.key} className="sbtw-history-card">
                                    <div className="sbtw-history-top">
                                        <div>
                                            <strong className="sbtw-history-date">{formatTimeRange(item.startMoment, item.endMoment)}</strong>
                                            {/* <span className="sbtw-muted small d-block">Booking #{item.bookingId || "-"}</span> */}
                                        </div>
                                        <div className="d-flex flex-wrap justify-content-end gap-1">
                                            <span className={`sbtw-status ${statusMeta.className}`}>
                                                {statusMeta.label}
                                            </span>
                                            <span className={`sbtw-status ${paymentMeta.className}`}>
                                                {paymentMeta.label}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="sbtw-history-grid">
                                        <div className="sbtw-history-field">
                                            <span>Subject</span>
                                            <strong>{item.subjectName}</strong>
                                        </div>
                                        <div className="sbtw-history-field">
                                            <span>Teacher</span>
                                            <strong>{item.teacherName}</strong>
                                        </div>
                                        <div className="sbtw-history-field">
                                            <span>Type / Session</span>
                                            <strong>{item.bookingType} · {item.sessionType}</strong>
                                        </div>
                                        <div className="sbtw-history-field">
                                            <span>Source</span>
                                            <strong>{item.source}</strong>
                                        </div>
                                        {groupDetail ? (
                                            <div className="sbtw-history-field sbtw-history-group-detail">
                                                <span>Group detail</span>
                                                <strong>{groupDetail}</strong>
                                            </div>
                                        ) : null}
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
};

const StudentBookingTrackerLayer = () => {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState("");
    const [searchTerm, setSearchTerm] = useState("");
    const [statusFilter, setStatusFilter] = useState("");
    const [bookingTypeFilter, setBookingTypeFilter] = useState("");
    const [paymentFilter, setPaymentFilter] = useState("");
    const [upcomingCountFilter, setUpcomingCountFilter] = useState("");
    const [zeroUpcomingFilter, setZeroUpcomingFilter] = useState("all");
    const [upcomingSortOrder, setUpcomingSortOrder] = useState("ascending");
    const [currentPage, setCurrentPage] = useState(1);
    const [selectedRow, setSelectedRow] = useState(null);

    const fetchBookings = useCallback(async () => {
        setLoading(true);
        setLoadError("");

        try {
            const response = await getAllBookings();
            setRows(buildTrackerRows(extractRows(response)));
        } catch (error) {
            console.error("getAllBookings failed for Student Booking Tracker:", error);
            setRows([]);
            setLoadError(error?.message || "Bookings could not be loaded. Please check the network and try again.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchBookings();
    }, [fetchBookings]);

    const statusOptions = useMemo(
        () =>
            unique(
                rows
                    .map((row) => row.status)
                    .filter((status) => status !== "Needs review")
            ).sort(),
        [rows]
    );
    const bookingTypeOptions = useMemo(
        () => unique(rows.flatMap((row) => row.bookingTypes)).sort(),
        [rows]
    );
    const paymentFilterOptions = useMemo(
        () => PAYMENT_STATUS_ORDER.filter((status) => rows.some((row) => (row.paymentCounts[status] || 0) > 0)),
        [rows]
    );
    const upcomingCountOptions = useMemo(
        () => [...new Set(rows.map((row) => Number(row.upcomingLessons) || 0))].sort((first, second) => first - second),
        [rows]
    );

    const filteredRows = useMemo(() => {
        const search = norm(searchTerm);

        const matchingRows = rows.filter((row) => {
            const searchableText = norm([
                row.student.name,
                row.student.username,
                row.student.email,
                row.student.parentEmails.join(" "),
                row.student.parentPhone,
                row.subjects.map((item) => item.label).join(" "),
                row.teachers.map((item) => item.label).join(" "),
                row.bookingTypes.join(" "),
                row.sessionTypes.join(" "),
                row.bookingSources.join(" "),
                row.status,
                row.needsRebookingSubjects.map((item) => `${item.subjectName} needs rebooking`).join(" "),
                PAYMENT_STATUS_ORDER.filter((status) => (row.paymentCounts[status] || 0) > 0).join(" "),
            ].join(" "));
            return (
                (!search || searchableText.includes(search)) &&
                (!statusFilter || row.status === statusFilter) &&
                (!bookingTypeFilter || row.bookingTypes.includes(bookingTypeFilter)) &&
                (!paymentFilter || (row.paymentCounts[paymentFilter] || 0) > 0) &&
                (upcomingCountFilter === "" || Number(row.upcomingLessons) === Number(upcomingCountFilter)) &&
                (zeroUpcomingFilter !== "zero_only" || Number(row.upcomingLessons) === 0) &&
                (zeroUpcomingFilter !== "exclude_zero" || Number(row.upcomingLessons) > 0)
            );
        });

        return matchingRows.sort((first, second) => {
            const difference = Number(first.upcomingLessons) - Number(second.upcomingLessons);
            if (difference !== 0) {
                return upcomingSortOrder === "descending" ? -difference : difference;
            }

            const needsRebookingDifference =
                second.needsRebookingSubjects.length - first.needsRebookingSubjects.length;

            if (needsRebookingDifference !== 0) return needsRebookingDifference;
            return first.student.name.localeCompare(second.student.name);
        });
    }, [
        rows,
        searchTerm,
        statusFilter,
        bookingTypeFilter,
        paymentFilter,
        upcomingCountFilter,
        zeroUpcomingFilter,
        upcomingSortOrder,
    ]);

    const totalPages = Math.max(1, Math.ceil(filteredRows.length / ITEMS_PER_PAGE));
    const paginatedRows = useMemo(() => {
        const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
        return filteredRows.slice(startIndex, startIndex + ITEMS_PER_PAGE);
    }, [filteredRows, currentPage]);

    useEffect(() => {
        setCurrentPage(1);
    }, [
        searchTerm,
        statusFilter,
        bookingTypeFilter,
        paymentFilter,
        upcomingCountFilter,
        zeroUpcomingFilter,
        upcomingSortOrder,
    ]);

    useEffect(() => {
        if (currentPage > totalPages) setCurrentPage(totalPages);
    }, [currentPage, totalPages]);

    const metrics = useMemo(() => ({
        students: new Set(rows.map((row) => row.student.id || row.student.name)).size,
        activeRows: rows.filter((row) => row.upcomingLessons > 0 || row.ongoingLessons > 0).length,
        needsAttention: rows.filter((row) => !row.upcomingLessons && !row.ongoingLessons && row.totalBookings > 0).length,
        subjectsNeedingRebooking: rows.reduce(
            (total, row) => total + row.needsRebookingSubjects.length,
            0
        ),
        upcomingSoon: rows.filter((row) => {
            if (!row.nextMoment) return false;
            const days = row.nextMoment.clone().startOf("day").diff(moment.tz(PORTAL_TIMEZONE).startOf("day"), "days");
            return days >= 0 && days <= 7;
        }).length,
    }), [rows]);

    const getExportRows = () => filteredRows.map((row) => ({
        "Student Name": row.student.name,
        Username: row.student.username || "-",
        "Student Email": row.student.email || "-",
        "Parent Email": row.student.parentEmails.join(", ") || "-",
        "Parent Phone": row.student.parentPhone || "-",
        Subjects: row.breakdown.map((item) => item.subjectName).join(", ") || "-",
        "Current Teacher(s)": row.teachers.map((item) => item.label).join(", ") || "-",
        "Subject Coverage": row.breakdown
            .map((item) => `${item.subjectName}: ${item.upcomingLessons} upcoming (${item.needsRebooking ? "Needs Rebooking" : "Covered"})`)
            .join(" | ") || "-",
        "Subjects Need Rebooking": row.needsRebookingSubjects.length,
        "Rebooking Subjects": row.needsRebookingSubjects.map((item) => item.subjectName).join(", ") || "-",
        "Total Lessons": row.totalBookings,
        Completed: row.completedLessons,
        Upcoming: row.upcomingLessons,
        "Last Lesson": formatMoment(row.lastMoment),
        "Days Since Last Lesson": row.daysSince === null ? "-" : row.daysSince,
        "Next Lesson": formatMoment(row.nextMoment),
        Status: row.status,
    }));

    const exportToExcel = () => {
        const exportRows = getExportRows();
        if (!exportRows.length) return;

        const worksheet = XLSX.utils.json_to_sheet(exportRows);
        worksheet["!cols"] = [
            { wch: 24 }, { wch: 18 }, { wch: 28 }, { wch: 34 }, { wch: 18 },
            { wch: 30 }, { wch: 30 }, { wch: 65 }, { wch: 18 }, { wch: 30 },
            { wch: 15 }, { wch: 13 }, { wch: 13 }, { wch: 24 }, { wch: 22 },
            { wch: 24 }, { wch: 22 },
        ];

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Booking Tracker");
        XLSX.writeFile(
            workbook,
            `student-booking-tracker-${moment.tz(PORTAL_TIMEZONE).format("YYYY-MM-DD")}.xlsx`
        );
    };

    const exportToPDF = () => {
        const exportRows = getExportRows();
        if (!exportRows.length) return;

        const document = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
        const generatedAt = moment.tz(PORTAL_TIMEZONE).format("DD MMM YYYY, hh:mm A");

        document.setFontSize(14);
        document.text("Student Booking Tracker", 40, 34);
        document.setFontSize(8);
        document.setTextColor(100);
        document.text(`Generated: ${generatedAt} (Asia/Dubai)`, 40, 48);

        autoTable(document, {
            startY: 62,
            head: [[
                "Student", "Email / Username", "Parent Contact", "Subjects & Current Teacher",
                "Subject Coverage", "Total", "Completed", "Upcoming", "Needs Rebooking",
                "Last Lesson", "Next Lesson", "Status",
            ]],
            body: exportRows.map((row) => [
                row["Student Name"],
                `${row["Student Email"] !== "-" ? row["Student Email"] : row.Username}`,
                `${row["Parent Email"]}\n${row["Parent Phone"]}`,
                `${row.Subjects}\n${row["Current Teacher(s)"]}`,
                row["Subject Coverage"],
                row["Total Lessons"],
                row.Completed,
                row.Upcoming,
                row["Rebooking Subjects"],
                row["Last Lesson"],
                row["Next Lesson"],
                row.Status,
            ]),
            theme: "grid",
            styles: { fontSize: 5.8, cellPadding: 3, overflow: "linebreak" },
            headStyles: { fillColor: [47, 128, 237], fontSize: 6, textColor: 255 },
            columnStyles: {
                0: { cellWidth: 58 },
                1: { cellWidth: 80 },
                2: { cellWidth: 80 },
                3: { cellWidth: 95 },
                4: { cellWidth: 125 },
                5: { cellWidth: 30 },
                6: { cellWidth: 38 },
                7: { cellWidth: 36 },
                8: { cellWidth: 72 },
                9: { cellWidth: 68 },
                10: { cellWidth: 68 },
                11: { cellWidth: 58 },
            },
            margin: { left: 22, right: 22 },
        });

        document.save(
            `student-booking-tracker-${moment.tz(PORTAL_TIMEZONE).format("YYYY-MM-DD")}.pdf`
        );
    };

    const resetFilters = () => {
        setSearchTerm("");
        setStatusFilter("");
        setBookingTypeFilter("");
        setPaymentFilter("");
        setUpcomingCountFilter("");
        setZeroUpcomingFilter("all");
        setUpcomingSortOrder("ascending");
    };

    return (
        <>
            <style>{`
        .sbtw-page-card { background: #ffffff !important; color: #344054; overflow: visible !important; }
        .sbtw-page-card .card-body { padding: 24px; }
        .sbtw-title { color: #101828; font-weight: 700; }
        .sbtw-muted { color: #667085; }
        .sbtw-stat-card { display: flex; align-items: center; gap: 14px; min-height: 98px; padding: 18px; background: #ffffff; border: 1px solid #eaecf0; border-radius: 12px; }
        .sbtw-stat-icon { display: inline-flex; align-items: center; justify-content: center; width: 48px; height: 48px; border-radius: 12px; font-size: 24px; }
        .sbtw-stat-icon.blue { background: #e9efff; color: #3b82f6; }
        .sbtw-stat-icon.green { background: #e9f9ef; color: #16a34a; }
        .sbtw-stat-icon.orange { background: #fff3df; color: #f97316; }
        .sbtw-stat-icon.red { background: #fff0f0; color: #ef4444; }
        .sbtw-stat-label { display: block; color: #667085; font-size: 12px; font-weight: 700; }
        .sbtw-stat-value { display: block; margin-top: 3px; color: #101828; font-size: 26px; line-height: 1.1; }
        .sbtw-filter-card { padding: 18px; background: #f8fafc; border: 1px solid #eaecf0; border-radius: 12px; }
        .sbtw-filter-card label { display: block; margin-bottom: 6px; color: #344054; font-size: 12px; font-weight: 700; }
        .sbtw-input, .sbtw-select, .sbtw-input-group-text { background: #ffffff !important; color: #344054 !important; border-color: #d0d5dd !important; }
        .sbtw-input::placeholder { color: #98a2b3; }
        .sbtw-input:focus, .sbtw-select:focus { border-color: #2f80ed !important; box-shadow: 0 0 0 .2rem rgba(47, 128, 237, .12) !important; }
        /* Keep an always-available horizontal bar below both tables. */
        .sbtw-scroll-hint { display: flex; align-items: center; justify-content: flex-end; gap: 6px; margin: 0 2px 7px; color: #667085; font-size: 11px; font-weight: 600; }
        .sbtw-scroll-hint svg { font-size: 15px; }
        .sbtw-table-wrap, .sbtw-modal-table-wrap { width: 100%; border: 1px solid #eaecf0; border-radius: 12px; overflow-x: scroll !important; overflow-y: hidden; -webkit-overflow-scrolling: touch; overscroll-behavior-x: contain; scrollbar-gutter: stable both-edges; scrollbar-width: auto; scrollbar-color: #667085 #eaecf0; }
        .sbtw-table-wrap::-webkit-scrollbar, .sbtw-modal-table-wrap::-webkit-scrollbar { height: 12px; }
        .sbtw-table-wrap::-webkit-scrollbar-track, .sbtw-modal-table-wrap::-webkit-scrollbar-track { background: #eaecf0; border-radius: 999px; }
        .sbtw-table-wrap::-webkit-scrollbar-thumb, .sbtw-modal-table-wrap::-webkit-scrollbar-thumb { background: #667085; border: 3px solid #eaecf0; border-radius: 999px; }
        .sbtw-table { min-width: 1640px; color: #344054 !important; }
        .sbtw-modal-table-wrap .sbtw-table { min-width: 940px; }
        .sbtw-table thead th { padding: 13px 14px; color: #344054 !important; background: #f9fafb !important; border-color: #eaecf0 !important; font-size: 12px; font-weight: 700; white-space: nowrap; }
        .sbtw-table tbody td { padding: 14px; color: #344054 !important; background: #ffffff !important; border-color: #eaecf0 !important; font-size: 13px; vertical-align: middle; }
        .sbtw-table tbody tr:hover td { background: #f8fbff !important; }
        .sbtw-student-name { color: #101828; font-weight: 700; }
        .sbtw-subtext { margin-top: 3px; color: #667085; font-size: 11px; }
        .sbtw-coverage-cell { min-width: 238px; }
        .sbtw-coverage-summary { display: flex; align-items: center; gap: 7px; color: #101828; font-size: 12px; font-weight: 700; line-height: 1.2; white-space: nowrap; }
        .sbtw-coverage-divider { width: 3px; height: 3px; flex: 0 0 3px; background: #98a2b3; border-radius: 999px; }
        .sbtw-rebook-badge, .sbtw-covered-badge { display: inline-flex; align-items: center; gap: 4px; margin-top: 7px; padding: 4px 7px; border: 1px solid transparent; border-radius: 6px; font-size: 10px; font-weight: 700; line-height: 1; white-space: nowrap; }
        .sbtw-rebook-badge { color: #b42318; background: #fef3f2; border-color: #fecdca; }
        .sbtw-covered-badge { color: #067647; background: #ecfdf3; border-color: #abefc6; }
        .sbtw-rebook-panel { display: flex; align-items: center; gap: 8px; padding: 10px 12px; color: #b42318; background: #fef3f2; border: 1px solid #fecdca; border-radius: 8px; font-size: 12px; font-weight: 700; }
        .sbtw-count { color: #101828; font-size: 15px; font-weight: 700; }
        .sbtw-days { display: inline-flex; align-items: center; justify-content: center; min-width: 42px; padding: 5px 8px; color: #175cd3; background: #eff8ff; border-radius: 7px; font-weight: 700; }
        .sbtw-days-old { color: #b42318; background: #fef3f2; }
        .sbtw-status { display: inline-flex; align-items: center; white-space: nowrap; padding: 4px 8px; border-radius: 6px; font-size: 11px; font-weight: 700; }
        .sbtw-status-success { color: #067647; background: #ecfdf3; }
        .sbtw-status-info { color: #175cd3; background: #eff8ff; }
        .sbtw-status-primary { color: #3730a3; background: #eef2ff; }
        .sbtw-status-warning { color: #b54708; background: #fffaeb; }
        .sbtw-status-danger { color: #b42318; background: #fef3f2; }
        .sbtw-status-neutral { color: #475467; background: #f2f4f7; }
        .sbtw-chip { display: inline-flex; padding: 4px 8px; color: #475467; background: #f2f4f7; border: 1px solid #eaecf0; border-radius: 6px; font-size: 11px; font-weight: 700; }
        .sbtw-modal-backdrop { position: fixed; inset: 0; z-index: 2500; display: flex; align-items: center; justify-content: center; padding: 20px; background: rgba(16, 24, 40, .58); }
        .sbtw-modal { width: min(1220px, 100%); max-height: 94vh; overflow: hidden; color: #344054; background: #ffffff; border: 1px solid #eaecf0; border-radius: 14px; box-shadow: 0 24px 64px rgba(16, 24, 40, .28); }
        .sbtw-modal-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding: 20px 24px; color: #101828; background: #f9fafb; border-bottom: 1px solid #eaecf0; }
        .sbtw-modal-header h5 { color: inherit; font-weight: 700; }
        .sbtw-close-button { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; padding: 0; color: #475467; background: transparent; border: 1px solid #d0d5dd; border-radius: 8px; font-size: 20px; }
        .sbtw-modal-body { max-height: calc(94vh - 88px); padding: 24px; overflow-y: auto; }
        .sbtw-detail-card { display: flex; flex-direction: column; gap: 5px; height: 100%; padding: 14px; color: #101828; background: #f9fafb; border: 1px solid #eaecf0; border-radius: 10px; }
        .sbtw-detail-card strong { overflow-wrap: anywhere; }
        .sbtw-detail-label { color: #667085; font-size: 10px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
        .sbtw-schedule-list { display: grid; gap: 12px; }
        .sbtw-schedule-day { overflow: hidden; border: 1px solid #eaecf0; border-radius: 10px; }
        .sbtw-schedule-date { padding: 9px 12px; color: #344054; background: #f9fafb; border-bottom: 1px solid #eaecf0; font-size: 12px; font-weight: 700; }
        .sbtw-schedule-item { display: grid; grid-template-columns: 160px minmax(0, 1fr); gap: 12px; align-items: center; padding: 11px 12px; border-bottom: 1px solid #eaecf0; }
        .sbtw-schedule-item:last-child { border-bottom: 0; }
        .sbtw-schedule-time { color: #175cd3; font-size: 12px; font-weight: 700; }
        .sbtw-empty { padding: 18px; color: #667085; background: #f9fafb; border: 1px dashed #d0d5dd; border-radius: 10px; text-align: center; }
        .sbtw-history-list { display: grid; gap: 12px; }
        .sbtw-history-card { padding: 14px; color: #344054; background: #ffffff; border: 1px solid #eaecf0; border-radius: 10px; }
        .sbtw-history-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding-bottom: 12px; border-bottom: 1px solid #eaecf0; }
        .sbtw-history-date { color: #101828; font-size: 14px; }
        .sbtw-history-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; padding-top: 12px; }
        .sbtw-history-field { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
        .sbtw-history-field span { color: #667085; font-size: 10px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
        .sbtw-history-field strong { overflow-wrap: anywhere; color: #344054; font-size: 12px; }
        .sbtw-history-group-detail { grid-column: span 4; }

        /* WowDash dark-mode selectors. They work with both data-theme and body-class variants. */
        [data-theme="dark"] .sbtw-page-card, [data-bs-theme="dark"] .sbtw-page-card, body.dark-theme .sbtw-page-card, body.dark-mode .sbtw-page-card, body.dark .sbtw-page-card, html.dark .sbtw-page-card, .theme-dark .sbtw-page-card { background: #273145 !important; color: #e5e7eb !important; }
        [data-theme="dark"] .sbtw-title, [data-bs-theme="dark"] .sbtw-title, body.dark-theme .sbtw-title, body.dark-mode .sbtw-title, body.dark .sbtw-title, html.dark .sbtw-title, .theme-dark .sbtw-title { color: #f8fafc !important; }
        [data-theme="dark"] .sbtw-muted, [data-bs-theme="dark"] .sbtw-muted, body.dark-theme .sbtw-muted, body.dark-mode .sbtw-muted, body.dark .sbtw-muted, html.dark .sbtw-muted, .theme-dark .sbtw-muted, [data-theme="dark"] .sbtw-subtext, [data-bs-theme="dark"] .sbtw-subtext, body.dark-theme .sbtw-subtext, body.dark-mode .sbtw-subtext, body.dark .sbtw-subtext, html.dark .sbtw-subtext, .theme-dark .sbtw-subtext { color: #aeb9cc !important; }
        [data-theme="dark"] .sbtw-rebook-panel, [data-bs-theme="dark"] .sbtw-rebook-panel, body.dark-theme .sbtw-rebook-panel, body.dark-mode .sbtw-rebook-panel, body.dark .sbtw-rebook-panel, html.dark .sbtw-rebook-panel, .theme-dark .sbtw-rebook-panel { color: #fecaca !important; background: #4a2428 !important; border-color: #7f3037 !important; }
        [data-theme="dark"] .sbtw-stat-card, [data-bs-theme="dark"] .sbtw-stat-card, body.dark-theme .sbtw-stat-card, body.dark-mode .sbtw-stat-card, body.dark .sbtw-stat-card, html.dark .sbtw-stat-card, .theme-dark .sbtw-stat-card { background: #273145 !important; border-color: #3a4760 !important; }
        [data-theme="dark"] .sbtw-stat-label, [data-bs-theme="dark"] .sbtw-stat-label, body.dark-theme .sbtw-stat-label, body.dark-mode .sbtw-stat-label, body.dark .sbtw-stat-label, html.dark .sbtw-stat-label, .theme-dark .sbtw-stat-label { color: #aeb9cc !important; }
        [data-theme="dark"] .sbtw-stat-value, [data-bs-theme="dark"] .sbtw-stat-value, body.dark-theme .sbtw-stat-value, body.dark-mode .sbtw-stat-value, body.dark .sbtw-stat-value, html.dark .sbtw-stat-value, .theme-dark .sbtw-stat-value { color: #f8fafc !important; }
        [data-theme="dark"] .sbtw-filter-card, [data-bs-theme="dark"] .sbtw-filter-card, body.dark-theme .sbtw-filter-card, body.dark-mode .sbtw-filter-card, body.dark .sbtw-filter-card, html.dark .sbtw-filter-card, .theme-dark .sbtw-filter-card { background: #273145 !important; border-color: #3a4760 !important; }
        [data-theme="dark"] .sbtw-filter-card label, [data-bs-theme="dark"] .sbtw-filter-card label, body.dark-theme .sbtw-filter-card label, body.dark-mode .sbtw-filter-card label, body.dark .sbtw-filter-card label, html.dark .sbtw-filter-card label, .theme-dark .sbtw-filter-card label { color: #d7deea !important; }
        [data-theme="dark"] .sbtw-input, [data-theme="dark"] .sbtw-select, [data-theme="dark"] .sbtw-input-group-text, [data-bs-theme="dark"] .sbtw-input, [data-bs-theme="dark"] .sbtw-select, [data-bs-theme="dark"] .sbtw-input-group-text, body.dark-theme .sbtw-input, body.dark-theme .sbtw-select, body.dark-theme .sbtw-input-group-text, body.dark-mode .sbtw-input, body.dark-mode .sbtw-select, body.dark-mode .sbtw-input-group-text, body.dark .sbtw-input, body.dark .sbtw-select, body.dark .sbtw-input-group-text, html.dark .sbtw-input, html.dark .sbtw-select, html.dark .sbtw-input-group-text, .theme-dark .sbtw-input, .theme-dark .sbtw-select, .theme-dark .sbtw-input-group-text { color: #edf2f7 !important; background: #202a3b !important; border-color: #46536b !important; }
        [data-theme="dark"] .sbtw-input::placeholder, [data-bs-theme="dark"] .sbtw-input::placeholder, body.dark-theme .sbtw-input::placeholder, body.dark-mode .sbtw-input::placeholder, body.dark .sbtw-input::placeholder, html.dark .sbtw-input::placeholder, .theme-dark .sbtw-input::placeholder { color: #8c9ab0 !important; }
        [data-theme="dark"] .sbtw-scroll-hint, [data-bs-theme="dark"] .sbtw-scroll-hint, body.dark-theme .sbtw-scroll-hint, body.dark-mode .sbtw-scroll-hint, body.dark .sbtw-scroll-hint, html.dark .sbtw-scroll-hint, .theme-dark .sbtw-scroll-hint { color: #aeb9cc !important; }
        [data-theme="dark"] .sbtw-table-wrap, [data-theme="dark"] .sbtw-modal-table-wrap, [data-bs-theme="dark"] .sbtw-table-wrap, [data-bs-theme="dark"] .sbtw-modal-table-wrap, body.dark-theme .sbtw-table-wrap, body.dark-theme .sbtw-modal-table-wrap, body.dark-mode .sbtw-table-wrap, body.dark-mode .sbtw-modal-table-wrap, body.dark .sbtw-table-wrap, body.dark .sbtw-modal-table-wrap, html.dark .sbtw-table-wrap, html.dark .sbtw-modal-table-wrap, .theme-dark .sbtw-table-wrap, .theme-dark .sbtw-modal-table-wrap { border-color: #3a4760 !important; scrollbar-color: #72809a #1f2937; }
        [data-theme="dark"] .sbtw-table-wrap::-webkit-scrollbar-track, [data-theme="dark"] .sbtw-modal-table-wrap::-webkit-scrollbar-track, [data-bs-theme="dark"] .sbtw-table-wrap::-webkit-scrollbar-track, [data-bs-theme="dark"] .sbtw-modal-table-wrap::-webkit-scrollbar-track, body.dark-theme .sbtw-table-wrap::-webkit-scrollbar-track, body.dark-theme .sbtw-modal-table-wrap::-webkit-scrollbar-track, body.dark-mode .sbtw-table-wrap::-webkit-scrollbar-track, body.dark-mode .sbtw-modal-table-wrap::-webkit-scrollbar-track, body.dark .sbtw-table-wrap::-webkit-scrollbar-track, body.dark .sbtw-modal-table-wrap::-webkit-scrollbar-track, html.dark .sbtw-table-wrap::-webkit-scrollbar-track, html.dark .sbtw-modal-table-wrap::-webkit-scrollbar-track, .theme-dark .sbtw-table-wrap::-webkit-scrollbar-track, .theme-dark .sbtw-modal-table-wrap::-webkit-scrollbar-track { background: #1f2937; }
        [data-theme="dark"] .sbtw-table-wrap::-webkit-scrollbar-thumb, [data-theme="dark"] .sbtw-modal-table-wrap::-webkit-scrollbar-thumb, [data-bs-theme="dark"] .sbtw-table-wrap::-webkit-scrollbar-thumb, [data-bs-theme="dark"] .sbtw-modal-table-wrap::-webkit-scrollbar-thumb, body.dark-theme .sbtw-table-wrap::-webkit-scrollbar-thumb, body.dark-theme .sbtw-modal-table-wrap::-webkit-scrollbar-thumb, body.dark-mode .sbtw-table-wrap::-webkit-scrollbar-thumb, body.dark-mode .sbtw-modal-table-wrap::-webkit-scrollbar-thumb, body.dark .sbtw-table-wrap::-webkit-scrollbar-thumb, body.dark .sbtw-modal-table-wrap::-webkit-scrollbar-thumb, html.dark .sbtw-table-wrap::-webkit-scrollbar-thumb, html.dark .sbtw-modal-table-wrap::-webkit-scrollbar-thumb, .theme-dark .sbtw-table-wrap::-webkit-scrollbar-thumb, .theme-dark .sbtw-modal-table-wrap::-webkit-scrollbar-thumb { background: #72809a; border-color: #1f2937; }
        [data-theme="dark"] .sbtw-table thead th, [data-bs-theme="dark"] .sbtw-table thead th, body.dark-theme .sbtw-table thead th, body.dark-mode .sbtw-table thead th, body.dark .sbtw-table thead th, html.dark .sbtw-table thead th, .theme-dark .sbtw-table thead th { color: #f2f4f7 !important; background: #1f2937 !important; border-color: #3a4760 !important; }
        [data-theme="dark"] .sbtw-table tbody td, [data-bs-theme="dark"] .sbtw-table tbody td, body.dark-theme .sbtw-table tbody td, body.dark-mode .sbtw-table tbody td, body.dark .sbtw-table tbody td, html.dark .sbtw-table tbody td, .theme-dark .sbtw-table tbody td { color: #d7deea !important; background: #273145 !important; border-color: #3a4760 !important; }
        [data-theme="dark"] .sbtw-table tbody tr:hover td, [data-bs-theme="dark"] .sbtw-table tbody tr:hover td, body.dark-theme .sbtw-table tbody tr:hover td, body.dark-mode .sbtw-table tbody tr:hover td, body.dark .sbtw-table tbody tr:hover td, html.dark .sbtw-table tbody tr:hover td, .theme-dark .sbtw-table tbody tr:hover td { background: #303c52 !important; }
        [data-theme="dark"] .sbtw-student-name, [data-theme="dark"] .sbtw-count, [data-bs-theme="dark"] .sbtw-student-name, [data-bs-theme="dark"] .sbtw-count, body.dark-theme .sbtw-student-name, body.dark-theme .sbtw-count, body.dark-mode .sbtw-student-name, body.dark-mode .sbtw-count, body.dark .sbtw-student-name, body.dark .sbtw-count, html.dark .sbtw-student-name, html.dark .sbtw-count, .theme-dark .sbtw-student-name, .theme-dark .sbtw-count { color: #f8fafc !important; }
        [data-theme="dark"] .sbtw-coverage-summary, [data-bs-theme="dark"] .sbtw-coverage-summary, body.dark-theme .sbtw-coverage-summary, body.dark-mode .sbtw-coverage-summary, body.dark .sbtw-coverage-summary, html.dark .sbtw-coverage-summary, .theme-dark .sbtw-coverage-summary { color: #f8fafc !important; }
        [data-theme="dark"] .sbtw-rebook-badge, [data-bs-theme="dark"] .sbtw-rebook-badge, body.dark-theme .sbtw-rebook-badge, body.dark-mode .sbtw-rebook-badge, body.dark .sbtw-rebook-badge, html.dark .sbtw-rebook-badge, .theme-dark .sbtw-rebook-badge { color: #fecaca !important; background: #4a2428 !important; border-color: #7f3037 !important; }
        [data-theme="dark"] .sbtw-covered-badge, [data-bs-theme="dark"] .sbtw-covered-badge, body.dark-theme .sbtw-covered-badge, body.dark-mode .sbtw-covered-badge, body.dark .sbtw-covered-badge, html.dark .sbtw-covered-badge, .theme-dark .sbtw-covered-badge { color: #bbf7d0 !important; background: #1e4536 !important; border-color: #2b6b52 !important; }
        [data-theme="dark"] .sbtw-chip, [data-bs-theme="dark"] .sbtw-chip, body.dark-theme .sbtw-chip, body.dark-mode .sbtw-chip, body.dark .sbtw-chip, html.dark .sbtw-chip, .theme-dark .sbtw-chip { color: #d7deea !important; background: #202a3b !important; border-color: #46536b !important; }
        [data-theme="dark"] .sbtw-modal, [data-bs-theme="dark"] .sbtw-modal, body.dark-theme .sbtw-modal, body.dark-mode .sbtw-modal, body.dark .sbtw-modal, html.dark .sbtw-modal, .theme-dark .sbtw-modal { color: #e5e7eb !important; background: #273145 !important; border-color: #3a4760 !important; }
        [data-theme="dark"] .sbtw-modal-header, [data-bs-theme="dark"] .sbtw-modal-header, body.dark-theme .sbtw-modal-header, body.dark-mode .sbtw-modal-header, body.dark .sbtw-modal-header, html.dark .sbtw-modal-header, .theme-dark .sbtw-modal-header { color: #f8fafc !important; background: #202a3b !important; border-color: #3a4760 !important; }
        [data-theme="dark"] .sbtw-close-button, [data-bs-theme="dark"] .sbtw-close-button, body.dark-theme .sbtw-close-button, body.dark-mode .sbtw-close-button, body.dark .sbtw-close-button, html.dark .sbtw-close-button, .theme-dark .sbtw-close-button { color: #d7deea !important; border-color: #46536b !important; }
        [data-theme="dark"] .sbtw-detail-card, [data-bs-theme="dark"] .sbtw-detail-card, body.dark-theme .sbtw-detail-card, body.dark-mode .sbtw-detail-card, body.dark .sbtw-detail-card, html.dark .sbtw-detail-card, .theme-dark .sbtw-detail-card { color: #f8fafc !important; background: #202a3b !important; border-color: #3a4760 !important; }
        [data-theme="dark"] .sbtw-detail-label, [data-bs-theme="dark"] .sbtw-detail-label, body.dark-theme .sbtw-detail-label, body.dark-mode .sbtw-detail-label, body.dark .sbtw-detail-label, html.dark .sbtw-detail-label, .theme-dark .sbtw-detail-label { color: #aeb9cc !important; }
        [data-theme="dark"] .sbtw-schedule-day, [data-bs-theme="dark"] .sbtw-schedule-day, body.dark-theme .sbtw-schedule-day, body.dark-mode .sbtw-schedule-day, body.dark .sbtw-schedule-day, html.dark .sbtw-schedule-day, .theme-dark .sbtw-schedule-day { border-color: #3a4760 !important; }
        [data-theme="dark"] .sbtw-schedule-date, [data-bs-theme="dark"] .sbtw-schedule-date, body.dark-theme .sbtw-schedule-date, body.dark-mode .sbtw-schedule-date, body.dark .sbtw-schedule-date, html.dark .sbtw-schedule-date, .theme-dark .sbtw-schedule-date { color: #f8fafc !important; background: #202a3b !important; border-color: #3a4760 !important; }
        [data-theme="dark"] .sbtw-schedule-item, [data-bs-theme="dark"] .sbtw-schedule-item, body.dark-theme .sbtw-schedule-item, body.dark-mode .sbtw-schedule-item, body.dark .sbtw-schedule-item, html.dark .sbtw-schedule-item, .theme-dark .sbtw-schedule-item { color: #e5e7eb !important; border-color: #3a4760 !important; }
        [data-theme="dark"] .sbtw-empty, [data-bs-theme="dark"] .sbtw-empty, body.dark-theme .sbtw-empty, body.dark-mode .sbtw-empty, body.dark .sbtw-empty, html.dark .sbtw-empty, .theme-dark .sbtw-empty { color: #aeb9cc !important; background: #202a3b !important; border-color: #46536b !important; }
        [data-theme="dark"] .sbtw-history-card, [data-bs-theme="dark"] .sbtw-history-card, body.dark-theme .sbtw-history-card, body.dark-mode .sbtw-history-card, body.dark .sbtw-history-card, html.dark .sbtw-history-card, .theme-dark .sbtw-history-card { color: #e5e7eb !important; background: #273145 !important; border-color: #3a4760 !important; }
        [data-theme="dark"] .sbtw-history-top, [data-bs-theme="dark"] .sbtw-history-top, body.dark-theme .sbtw-history-top, body.dark-mode .sbtw-history-top, body.dark .sbtw-history-top, html.dark .sbtw-history-top, .theme-dark .sbtw-history-top { border-color: #3a4760 !important; }
        [data-theme="dark"] .sbtw-history-date, [data-bs-theme="dark"] .sbtw-history-date, body.dark-theme .sbtw-history-date, body.dark-mode .sbtw-history-date, body.dark .sbtw-history-date, html.dark .sbtw-history-date, .theme-dark .sbtw-history-date, [data-theme="dark"] .sbtw-history-field strong, [data-bs-theme="dark"] .sbtw-history-field strong, body.dark-theme .sbtw-history-field strong, body.dark-mode .sbtw-history-field strong, body.dark .sbtw-history-field strong, html.dark .sbtw-history-field strong, .theme-dark .sbtw-history-field strong { color: #f8fafc !important; }
        [data-theme="dark"] .sbtw-history-field span, [data-bs-theme="dark"] .sbtw-history-field span, body.dark-theme .sbtw-history-field span, body.dark-mode .sbtw-history-field span, body.dark .sbtw-history-field span, html.dark .sbtw-history-field span, .theme-dark .sbtw-history-field span { color: #aeb9cc !important; }

        @media (max-width: 767.98px) { .sbtw-page-card .card-body { padding: 16px; } .sbtw-filter-card { padding: 14px; } .sbtw-modal-backdrop { align-items: flex-start; padding: 0; } .sbtw-modal { min-height: 100vh; border-radius: 0; } .sbtw-modal-header, .sbtw-modal-body { padding: 16px; } .sbtw-schedule-item { grid-template-columns: 1fr; gap: 3px; } .sbtw-history-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .sbtw-history-group-detail { grid-column: span 2; } }
      `}</style>

            <div className="card h-100 p-0 radius-12 sbtw-page-card">
                <div className="card-body">
                    <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-4">
                        <div>
                            <h5 className="sbtw-title mb-1">Student Booking Tracker</h5>
                            <p className="sbtw-muted mb-0">Dates and slots are shown in Asia/Dubai timezone.</p>
                        </div>
                        <div className="d-flex flex-wrap align-items-center gap-2">
                            <button
                                type="button"
                                className="btn btn-success d-inline-flex align-items-center gap-2"
                                onClick={exportToExcel}
                                disabled={loading || !filteredRows.length}
                            >
                                <Icon icon="mdi:file-excel-outline" />
                                Excel Export
                            </button>
                            <button
                                type="button"
                                className="btn btn-danger d-inline-flex align-items-center gap-2"
                                onClick={exportToPDF}
                                disabled={loading || !filteredRows.length}
                            >
                                <Icon icon="mdi:file-pdf-box" />
                                PDF Export
                            </button>
                            <button type="button" className="btn btn-primary d-inline-flex align-items-center gap-2" onClick={fetchBookings} disabled={loading}>
                                <Icon icon={loading ? "svg-spinners:3-dots-fade" : "mdi:refresh"} />
                                Refresh
                            </button>
                        </div>
                    </div>

                    <div className="row g-3 mb-4">
                        <SummaryCard icon="mdi:account-group-outline" label="Tracked Students" value={metrics.students} tone="blue" />
                        <SummaryCard icon="mdi:alert-circle-outline" label="Subjects Needing Rebooking" value={metrics.subjectsNeedingRebooking} tone="red" />
                        {/* <SummaryCard icon="mdi:calendar-check-outline" label="Active Rows" value={metrics.activeRows} tone="green" /> */}
                        {/* <SummaryCard icon="mdi:alert-circle-outline" label="Need Attention" value={metrics.needsAttention} tone="red" /> */}
                        {/* <SummaryCard icon="mdi:calendar-clock-outline" label="Upcoming Soon" value={metrics.upcomingSoon} tone="orange" /> */}
                    </div>

                    <div className="sbtw-filter-card mb-4">
                        <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
                            <div>
                                <h6 className="sbtw-title mb-1">Search and Filters</h6>
                                <p className="sbtw-muted small mb-0">Search student name</p>
                            </div>
                            <button type="button" className="btn btn-outline-secondary btn-sm d-inline-flex align-items-center gap-1" onClick={resetFilters}>
                                <Icon icon="mdi:filter-remove-outline" /> Reset
                            </button>
                        </div>

                        <div className="row g-3">
                            <div className="col-xl-4 col-lg-6">
                                <label htmlFor="tracker-search">Search</label>
                                <div className="input-group">
                                    <span className="input-group-text sbtw-input-group-text">
                                        <Icon icon="mdi:magnify" />
                                    </span>

                                    <input
                                        id="tracker-search"
                                        className="form-control sbtw-input"
                                        value={searchTerm}
                                        onChange={(event) => setSearchTerm(event.target.value)}
                                        placeholder="Student name"
                                    />
                                </div>
                            </div>

                            <div className="col-xl-2 col-lg-2 col-md-4">
                                <label htmlFor="tracker-status">Status</label>
                                <select
                                    id="tracker-status"
                                    className="form-select sbtw-select"
                                    value={statusFilter}
                                    onChange={(event) => setStatusFilter(event.target.value)}
                                >
                                    <option value="">All Statuses</option>
                                    {statusOptions.map((option) => (
                                        <option key={option} value={option}>
                                            {option}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="col-xl-2 col-lg-2 col-md-4">
                                <label htmlFor="tracker-type">Booking Type</label>
                                <select
                                    id="tracker-type"
                                    className="form-select sbtw-select"
                                    value={bookingTypeFilter}
                                    onChange={(event) => setBookingTypeFilter(event.target.value)}
                                >
                                    <option value="">All Types</option>
                                    {bookingTypeOptions.map((option) => (
                                        <option key={option} value={option}>
                                            {option}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="col-xl-2 col-lg-2 col-md-4">
                                <label htmlFor="tracker-payment">Payment</label>
                                <select
                                    id="tracker-payment"
                                    className="form-select sbtw-select"
                                    value={paymentFilter}
                                    onChange={(event) => setPaymentFilter(event.target.value)}
                                >
                                    <option value="">All Payments</option>
                                    {paymentFilterOptions.map((option) => (
                                        <option key={option} value={option}>
                                            Has {option}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="col-xl-2 col-lg-3 col-md-4">
                                <label htmlFor="tracker-upcoming-count">Upcoming Count</label>
                                <select
                                    id="tracker-upcoming-count"
                                    className="form-select sbtw-select"
                                    value={upcomingCountFilter}
                                    onChange={(event) => setUpcomingCountFilter(event.target.value)}
                                >
                                    <option value="">All Counts</option>
                                    {upcomingCountOptions.map((count) => (
                                        <option key={count} value={count}>{count} upcoming</option>
                                    ))}
                                </select>
                            </div>

                            <div className="col-xl-2 col-lg-3 col-md-4">
                                <label htmlFor="tracker-zero-upcoming">Zero Upcoming</label>
                                <select
                                    id="tracker-zero-upcoming"
                                    className="form-select sbtw-select"
                                    value={zeroUpcomingFilter}
                                    onChange={(event) => setZeroUpcomingFilter(event.target.value)}
                                >
                                    <option value="all">Include Zero</option>
                                    <option value="zero_only">Zero Only</option>
                                    <option value="exclude_zero">Exclude Zero</option>
                                </select>
                            </div>

                            <div className="col-xl-2 col-lg-3 col-md-4">
                                <label htmlFor="tracker-upcoming-sort">Sort by Upcoming</label>
                                <select
                                    id="tracker-upcoming-sort"
                                    className="form-select sbtw-select"
                                    value={upcomingSortOrder}
                                    onChange={(event) => setUpcomingSortOrder(event.target.value)}
                                >
                                    <option value="ascending">Fewest First</option>
                                    <option value="descending">Most First</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {loadError ? <div className="alert alert-danger py-2">{loadError}</div> : null}

                    {loading ? (
                        <div className="py-5 text-center">
                            <div className="spinner-border text-primary" role="status" />
                            <div className="sbtw-muted mt-2">Loading All Bookings data...</div>
                        </div>
                    ) : (
                        <>
                            <HorizontalScrollHint />
                            <div className="table-responsive sbtw-table-wrap">
                                <table className="table bordered-table mb-0 sbtw-table">
                                    <thead>
                                        <tr>
                                            <th>S.L</th>
                                            <th>Student</th>
                                            <th>Coverage</th>
                                            <th className="text-center">Total</th>
                                            <th className="text-center" title="Group recurring sessions with the same payment are counted once">Payment</th>
                                            <th className="text-center" title="Lessons marked completed by the existing All Bookings rules">Completed</th>
                                            <th className="text-center">Upcoming</th>
                                            <th>Last Lesson</th>
                                            <th className="text-center">Days Since Last Lesson</th>
                                            <th>Next Lesson</th>
                                            <th>Status</th>
                                            <th>Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {paginatedRows.length === 0 ? (
                                            <tr><td colSpan="12" className="text-center py-4 sbtw-muted">No booking tracker data found.</td></tr>
                                        ) : paginatedRows.map((row, index) => {
                                            const isOld = row.daysSince !== null && row.daysSince > 14;
                                            return (
                                                <tr key={row.rowKey}>
                                                    <td>{(currentPage - 1) * ITEMS_PER_PAGE + index + 1}</td>
                                                    <td>
                                                        <div className="sbtw-student-name">{row.student.name}</div>
                                                        <div className="sbtw-subtext">{row.student.username || row.student.email || `ID: ${row.student.id || "-"}`}</div>
                                                    </td>
                                                    <td className="sbtw-coverage-cell">
                                                        <div className="sbtw-coverage-summary">
                                                            <span>{row.subjects.length} subject{row.subjects.length === 1 ? "" : "s"}</span>
                                                            <span className="sbtw-coverage-divider" aria-hidden="true" />
                                                            <span>{row.teachers.length} current teacher{row.teachers.length === 1 ? "" : "s"}</span>
                                                        </div>
                                                        {row.needsRebookingSubjects.length ? (
                                                            <span className="sbtw-rebook-badge">
                                                                <Icon icon="mdi:alert-circle-outline" />
                                                                {row.needsRebookingSubjects.length} to rebook
                                                            </span>
                                                        ) : (
                                                            <span className="sbtw-covered-badge">
                                                                <Icon icon="mdi:check-circle-outline" />
                                                                All subjects covered
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="text-center"><span className="sbtw-count">{row.totalBookings}</span></td>
                                                    <td className="text-center">
                                                        <div className="d-flex flex-wrap justify-content-center gap-1">
                                                            {PAYMENT_STATUS_ORDER.map((paymentStatus) => {
                                                                const count = row.paymentCounts[paymentStatus] || 0;
                                                                const paymentMeta = getPaymentStatusMeta(paymentStatus);

                                                                return count > 0 ? (
                                                                    <span key={paymentStatus} className={`sbtw-status ${paymentMeta.className}`}>
                                                                        {count} {paymentMeta.label}
                                                                    </span>
                                                                ) : null;
                                                            })}
                                                        </div>
                                                    </td>
                                                    <td className="text-center"><span className="sbtw-count">{row.completedLessons}</span></td>
                                                    <td className="text-center"><span className={`sbtw-count ${row.upcomingLessons ? "text-success" : "text-danger"}`}>{row.upcomingLessons}</span></td>
                                                    <td>{formatMoment(row.lastMoment)}</td>
                                                    <td className="text-center">
                                                        {row.daysSince === null ? "-" : <span className={`sbtw-days ${isOld ? "sbtw-days-old" : ""}`}>{row.daysSince}d</span>}
                                                    </td>
                                                    <td>{formatMoment(row.nextMoment)}</td>
                                                    <td><StatusBadge status={row.status} /></td>
                                                    <td>
                                                        <button type="button" className="btn btn-sm btn-outline-primary d-inline-flex align-items-center gap-1" onClick={() => setSelectedRow(row)}>
                                                            <Icon icon="mdi:clipboard-text-search-outline" /> Details
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {filteredRows.length ? (
                                <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mt-3 px-2 pb-2">
                                    <span className="sbtw-muted small">Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} to {Math.min(currentPage * ITEMS_PER_PAGE, filteredRows.length)} of {filteredRows.length} entries</span>
                                    <div className="d-flex align-items-center gap-2">
                                        <button type="button" className="btn btn-outline-secondary btn-sm" disabled={currentPage === 1} onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}>Previous</button>
                                        <span className="sbtw-muted small">Page {currentPage} of {totalPages}</span>
                                        <button type="button" className="btn btn-outline-secondary btn-sm" disabled={currentPage === totalPages} onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}>Next</button>
                                    </div>
                                </div>
                            ) : null}
                        </>
                    )}
                </div>
            </div>

            <BookingLogsModal row={selectedRow} onClose={() => setSelectedRow(null)} />
        </>
    );
};

export default StudentBookingTrackerLayer;
