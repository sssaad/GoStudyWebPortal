import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import moment from "moment-timezone";
import Swal from "sweetalert2";
import { Icon } from "@iconify/react";
import { getToken } from "../api/getToken";
import CreateLiveGroupModal from "./CreateLiveGroupModal";
import CreateGroupBatchBookingModal from "./CreateGroupBatchBookingModal";
import WeeklyTimetableModal from "./WeeklyTimetableModal";
import CreateGroupProgrammeModal from "./CreateGroupProgrammeModal";

const RUN_STORED_PROCEDURE_URL =
  "https://api.learnyourlanguage.org/RestController_Thirdparty.php?view=runStoredProcedure";

const UPDATE_DYNAMIC_DATA_URL =
  "https://api.learnyourlanguage.org/RestController_Thirdparty.php?view=update_dynamic_data";

const API_HEADERS = {
  projectid: "1",
  userid: "test",
  password: "test",
  "x-api-key": "abc123456789",
  "Content-Type": "application/json",
};

const STATUS_OPTIONS = ["active", "paused", "completed", "cancelled"];
const PORTAL_TIMEZONE = "Asia/Dubai";

const getStatusLabel = (status) => {
  const s = String(status || "").toLowerCase();

  if (s === "active") return "Active";
  if (s === "paused") return "Paused";
  if (s === "completed") return "Completed";
  if (s === "cancelled") return "Cancelled";

  return status || "-";
};

const resolveToken = (tokenRes) => {
  if (typeof tokenRes === "string") return tokenRes;

  return (
    tokenRes?.token ||
    tokenRes?.data?.token ||
    tokenRes?.data?.data?.token ||
    tokenRes?.access_token ||
    tokenRes?.data?.access_token ||
    ""
  );
};

const extractRows = (response) => {
  const candidates = [
    response,
    response?.data,
    response?.data?.data,
    response?.result,
    response?.data?.result,
  ];

  for (const item of candidates) {
    if (Array.isArray(item)) return item;
  }

  return [];
};

const formatDate = (value) => {
  if (!value) return "-";

  const m = moment(value, ["YYYY-MM-DD", "YYYY-MM-DD HH:mm:ss"], true);
  return m.isValid() ? m.format("DD MMM YYYY") : value;
};

const formatTime = (value) => {
  if (!value) return "-";

  const clean = String(value).split(".")[0];
  const m = moment(clean, ["HH:mm:ss", "HH:mm"], true);

  return m.isValid() ? m.format("hh:mm A") : clean;
};

const normaliseTime = (value = "") => {
  const clean = String(value || "").split(".")[0].trim();
  if (!clean) return "";

  const parsed = moment(clean, ["HH:mm:ss", "HH:mm", "hh:mm A"], true);
  return parsed.isValid() ? parsed.format("HH:mm:ss") : clean;
};

const convertSessionToPortalTimezone = (session) => {
  const sourceTimezone =
    session?.timezone_location ||
    session?.teacher_timezone_location ||
    session?.source_timezone ||
    session?.timezone ||
    "Asia/Dubai";

  const sourceDate = session?.session_date || "";
  const sourceStart = normaliseTime(session?.slot_start || "");
  const sourceEnd = normaliseTime(session?.slot_end || "");

  if (!sourceDate || !sourceStart || !sourceEnd) {
    return {
      date: formatDate(sourceDate),
      slot: `${formatTime(sourceStart)} - ${formatTime(sourceEnd)}`,
    };
  }

  if (!moment.tz.zone(sourceTimezone) || !moment.tz.zone(PORTAL_TIMEZONE)) {
    return {
      date: formatDate(sourceDate),
      slot: `${formatTime(sourceStart)} - ${formatTime(sourceEnd)}`,
    };
  }

  const start = moment.tz(
    `${sourceDate} ${sourceStart}`,
    "YYYY-MM-DD HH:mm:ss",
    sourceTimezone
  );

  let end = moment.tz(
    `${sourceDate} ${sourceEnd}`,
    "YYYY-MM-DD HH:mm:ss",
    sourceTimezone
  );

  if (!start.isValid() || !end.isValid()) {
    return {
      date: formatDate(sourceDate),
      slot: `${formatTime(sourceStart)} - ${formatTime(sourceEnd)}`,
    };
  }

  if (!end.isAfter(start)) {
    end = end.add(1, "day");
  }

  const portalStart = start.clone().tz(PORTAL_TIMEZONE);
  const portalEnd = end.clone().tz(PORTAL_TIMEZONE);

  return {
    date: portalStart.format("DD MMM YYYY"),
    slot: `${portalStart.format("hh:mm A")} - ${portalEnd.format("hh:mm A")}`,
  };
};

const getTeacherTimezoneLabel = (session) => {
  return (
    session?.timezone_location ||
    session?.teacher_timezone_location ||
    session?.source_timezone ||
    session?.timezone ||
    "Asia/Dubai"
  );
};

const getGroupViewSessionEndMoment = (session) => {
  const sourceTimezone =
    session?.timezone_location ||
    session?.teacher_timezone_location ||
    session?.source_timezone ||
    session?.timezone ||
    "Asia/Dubai";

  const sourceDate = String(session?.session_date || "").trim();
  const sourceStart = normaliseTime(session?.slot_start || "");
  const sourceEnd = normaliseTime(session?.slot_end || "");

  if (!sourceDate || !sourceEnd) return null;

  if (moment.tz.zone(sourceTimezone)) {
    const start = moment.tz(
      `${sourceDate} ${sourceStart || "00:00:00"}`,
      "YYYY-MM-DD HH:mm:ss",
      sourceTimezone
    );

    let end = moment.tz(
      `${sourceDate} ${sourceEnd}`,
      "YYYY-MM-DD HH:mm:ss",
      sourceTimezone
    );

    if (!end.isValid()) return null;

    if (start.isValid() && !end.isAfter(start)) {
      end = end.add(1, "day");
    }

    return end;
  }

  const start = moment(
    `${sourceDate} ${sourceStart || "00:00:00"}`,
    "YYYY-MM-DD HH:mm:ss"
  );

  let end = moment(`${sourceDate} ${sourceEnd}`, "YYYY-MM-DD HH:mm:ss");

  if (!end.isValid()) return null;

  if (start.isValid() && !end.isAfter(start)) {
    end = end.add(1, "day");
  }

  return end;
};

const isGroupViewSessionPassed = (session) => {
  const endMoment = getGroupViewSessionEndMoment(session);

  if (!endMoment) return false;

  return endMoment.isBefore(moment());
};

const getStatusBadgeClass = (status) => {
  const s = String(status || "").toLowerCase();

  if (s === "active") return "bg-success";
  if (s === "paused") return "bg-warning text-dark";
  if (s === "completed") return "bg-primary";
  if (s === "cancelled") return "bg-danger";

  return "bg-secondary";
};

const getShortDescription = (text, limit = 90) => {
  const value = String(text || "").trim();
  if (!value) return "-";
  if (value.length <= limit) return value;
  return `${value.slice(0, limit)}...`;
};

const getWeekKey = (dateValue) => {
  if (!dateValue) return "no-week";

  const m = moment(dateValue, ["YYYY-MM-DD", "YYYY-MM-DD HH:mm:ss"], true);

  if (!m.isValid()) return "no-week";

  return m.startOf("isoWeek").format("YYYY-MM-DD");
};

const getGroupBatchId = (item) => {
  const batchId = Number(item?.group_batch_id || 0);
  return batchId > 0 ? batchId : 0;
};

const getSessionId = (session) => {
  const id = Number(
    session?.id || session?.group_live_session_id || session?.session_id || 0
  );

  return Number.isFinite(id) && id > 0 ? id : 0;
};

const getSessionWeekNo = (session) => {
  const value = Number(
    session?.week_no ||
    session?.actual_week_no ||
    session?.group_week_no ||
    session?.group_batch_week_no ||
    session?.recurrence_week_no ||
    1
  );

  return Number.isFinite(value) && value > 0 ? value : 1;
};

const getSessionClassOrder = (session, fallbackIndex = 0) => {
  const value = Number(
    session?.class_order ||
    session?.recurrence_day_no ||
    session?.class_no ||
    fallbackIndex + 1
  );

  return Number.isFinite(value) && value > 0 ? value : fallbackIndex + 1;
};

const getRecurrenceWeekNo = (session) => getSessionWeekNo(session);

const getRecurrenceDayNo = (session, fallbackIndex = 0) =>
  getSessionClassOrder(session, fallbackIndex);

const getRecurrenceTotalWeeks = (session) => {
  const explicitTotal = Number(session?.recurrence_total_weeks || 0);
  const weekNo = getRecurrenceWeekNo(session);

  if (Number.isFinite(explicitTotal) && explicitTotal > 0) {
    return explicitTotal;
  }

  return weekNo;
};

const isCancelledStatus = (value) => {
  const s = String(value || "").trim().toLowerCase();
  return s === "cancelled" || s === "canceled";
};

const isSessionVisible = (session) => {
  return !!session;
};
const compareSessions = (a, b) => {
  const weekA = getSessionWeekNo(a);
  const weekB = getSessionWeekNo(b);

  if (weekA !== weekB) return weekA - weekB;

  const classA = getSessionClassOrder(a, 0);
  const classB = getSessionClassOrder(b, 0);

  if (classA !== classB) return classA - classB;

  const dateA = `${a?.session_date || ""} ${normaliseTime(a?.slot_start || "")}`;
  const dateB = `${b?.session_date || ""} ${normaliseTime(b?.slot_start || "")}`;

  const timeA = moment(dateA, "YYYY-MM-DD HH:mm:ss", true).valueOf() || 0;
  const timeB = moment(dateB, "YYYY-MM-DD HH:mm:ss", true).valueOf() || 0;

  if (timeA !== timeB) return timeA - timeB;

  return getSessionId(a) - getSessionId(b);
};

const getExactSessionDuplicateKey = (session, index = 0) => {
  return [
    getSessionWeekNo(session),
    getSessionClassOrder(session, index),
    session?.subjectid || "",
    session?.teacherid || "",
    session?.session_date || "",
    normaliseTime(session?.slot_start || ""),
    normaliseTime(session?.slot_end || ""),
  ].join("_");
};

const dedupeExactSessionDuplicates = (sessions = []) => {
  const map = new Map();

  (Array.isArray(sessions) ? sessions : []).forEach((session, index) => {
    if (!isSessionVisible(session)) return;

    const key = getExactSessionDuplicateKey(session, index);
    const existing = map.get(key);

    if (!existing) {
      map.set(key, session);
      return;
    }

    if (getSessionId(session) >= getSessionId(existing)) {
      map.set(key, session);
    }
  });

  return Array.from(map.values()).sort(compareSessions);
};

const getBaseSessionsFromList = (sessions = []) => {
  const cleanSessions = dedupeExactSessionDuplicates(sessions);

  if (!cleanSessions.length) return [];

  const weekNos = cleanSessions
    .map(getSessionWeekNo)
    .filter((weekNo) => Number.isFinite(weekNo) && weekNo > 0);

  const baseWeekNo = weekNos.length ? Math.min(...weekNos) : 1;

  return cleanSessions
    .filter((session) => getSessionWeekNo(session) === baseWeekNo)
    .sort(compareSessions);
};

const getProgrammeBaseSessions = (programme) => {
  const sessions = Array.isArray(programme?.sessions) ? programme.sessions : [];
  return getBaseSessionsFromList(sessions);
};

const getProgrammeBaseClassCount = (programme) => {
  return getProgrammeBaseSessions(programme).length;
};

const getProgrammeTotalSessionCount = (programme) => {
  const sessions = Array.isArray(programme?.sessions) ? programme.sessions : [];
  return dedupeExactSessionDuplicates(sessions).length;
};

const getProgrammeRecurringWeeksCount = (programme) => {
  const sessions = Array.isArray(programme?.sessions) ? programme.sessions : [];
  const cleanSessions = dedupeExactSessionDuplicates(sessions);

  if (!cleanSessions.length) return 1;

  const distinctWeeks = Array.from(
    new Set(cleanSessions.map((session) => getSessionWeekNo(session)))
  ).filter(Boolean);

  const explicitMaxWeeks = Math.max(
    1,
    ...cleanSessions.map((session) =>
      Math.max(getRecurrenceTotalWeeks(session), getSessionWeekNo(session))
    )
  );

  return Math.max(1, distinctWeeks.length, explicitMaxWeeks);
};

const getProgrammeBookedCount = (programme) => {
  const programmeBooked = Number(programme?.booked_count || 0);

  const sessionBooked = Array.isArray(programme?.sessions)
    ? Math.max(
      ...programme.sessions.map((session) =>
        Number(session?.booked_count || 0)
      ),
      0
    )
    : 0;

  return Math.max(programmeBooked, sessionBooked);
};

const getAssistantTeachersLabel = (session) => {
  const value = String(session?.assistant_teacher_names || "").trim();

  if (
    !value ||
    value.toLowerCase() === "null" ||
    value.toLowerCase() === "undefined"
  ) {
    return "-";
  }

  return value
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean)
    .join(", ");
};

const GroupProgrammeDetailsModal = ({ open, programme, onClose }) => {
  if (!open || !programme) return null;

  const sourceSessions = Array.isArray(programme?.all_sessions)
    ? programme.all_sessions
    : Array.isArray(programme?.sessions)
      ? programme.sessions
      : [];

  const allSessions = dedupeExactSessionDuplicates(sourceSessions);

  /*
   * Portal view must stay transparent.
   * Show every active/non-cancelled week/session here, including past sessions.
   * Booking modal separately filters past weeks for booking safety.
   */
  const sessions = allSessions;

  const baseClassCount = getProgrammeBaseClassCount(programme);
  const totalSessionCount = sessions.length || getProgrammeTotalSessionCount(programme);
  const recurringWeeksCount = getProgrammeRecurringWeeksCount(programme);

  return (
    <div
      className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center"
      style={{
        background: "rgba(2, 6, 23, 0.74)",
        zIndex: 2300,
        padding: 16,
        backdropFilter: "blur(6px)",
      }}
      onClick={onClose}
    >
      <style>{`
        .gl-details-modal {
          width: min(1380px, 98vw);
          max-height: 94vh;
          overflow: hidden;
          border-radius: 22px;
          background: #243247;
          color: #ffffff;
          border: 1px solid rgba(148, 163, 184, 0.25);
          box-shadow: 0 30px 90px rgba(0, 0, 0, 0.50);
        }

        .gl-details-header {
          padding: 24px 26px;
          border-bottom: 1px solid rgba(148, 163, 184, 0.20);
          background: linear-gradient(135deg, #1d2b3f 0%, #26384f 100%);
        }

        .gl-details-title {
          margin: 0;
          color: #ffffff;
          font-size: 38px;
          font-weight: 900;
          line-height: 1.15;
          letter-spacing: -0.7px;
        }

        .gl-details-stage {
          margin-top: 8px;
          color: #c7d2e3;
          font-size: 15px;
          font-weight: 700;
        }

        .gl-details-close-icon {
          width: 42px;
          height: 42px;
          border-radius: 12px;
          border: 1px solid rgba(148, 163, 184, 0.35);
          background: rgba(15, 23, 42, 0.30);
          color: #dbe4f0;
          font-size: 22px;
          line-height: 1;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s ease;
          cursor: pointer;
        }

        .gl-details-close-icon:hover {
          background: rgba(239, 68, 68, 0.16);
          border-color: rgba(239, 68, 68, 0.48);
          color: #ffffff;
        }

        .gl-details-body {
          max-height: calc(94vh - 156px);
          overflow-y: auto;
          padding: 24px 26px;
          background: #243247;
        }

        .gl-details-body::-webkit-scrollbar {
          width: 8px;
        }

        .gl-details-body::-webkit-scrollbar-track {
          background: #172438;
        }

        .gl-details-body::-webkit-scrollbar-thumb {
          background: #64748b;
          border-radius: 999px;
        }

        .gl-details-body::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }

        .gl-stat-card {
          border: 1px solid rgba(148, 163, 184, 0.22);
          border-radius: 16px;
          padding: 18px 20px;
          background: linear-gradient(180deg, rgba(15, 23, 42, 0.78), rgba(15, 23, 42, 0.50));
          min-height: 94px;
          display: flex;
          flex-direction: column;
          justify-content: center;
        }

        .gl-stat-label {
          color: #9fb0c8;
          font-size: 13px;
          font-weight: 800;
          margin-bottom: 10px;
        }

        .gl-stat-value {
          color: #ffffff;
          font-size: 18px;
          font-weight: 900;
        }

        .gl-desc-title {
          color: #ffffff;
          font-size: 24px;
          font-weight: 900;
          margin: 4px 0 8px;
        }

        .gl-desc-text {
          color: #cbd5e1;
          font-size: 15px;
          line-height: 1.75;
          margin-bottom: 22px;
        }

        .gl-classes-card {
          border: 1px solid rgba(148, 163, 184, 0.22);
          border-radius: 18px;
          overflow: hidden;
          background: #1d2b3f;
        }

        .gl-classes-title {
          padding: 16px 18px;
          border-bottom: 1px solid rgba(148, 163, 184, 0.18);
          color: #ffffff;
          font-size: 16px;
          font-weight: 900;
          background: #182538;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }

        .gl-table-scroll {
          width: 100%;
          overflow-x: auto;
          overflow-y: hidden;
          padding-bottom: 8px;
        }

        .gl-table-scroll::-webkit-scrollbar {
          height: 9px;
        }

        .gl-table-scroll::-webkit-scrollbar-track {
          background: #172438;
          border-radius: 999px;
        }

        .gl-table-scroll::-webkit-scrollbar-thumb {
          background: #64748b;
          border-radius: 999px;
        }

        .gl-table-scroll::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }

        .gl-classes-table {
          width: 100%;
          min-width: 1180px;
          border-collapse: collapse;
        }

        .gl-classes-table th {
          background: #172438;
          color: #ffffff;
          font-size: 13px;
          font-weight: 900;
          padding: 14px 16px;
          white-space: nowrap;
          border-bottom: 1px solid rgba(148, 163, 184, 0.14);
        }

        .gl-classes-table td {
          background: #243247;
          color: #dbe4f0;
          font-size: 14px;
          font-weight: 700;
          padding: 18px 16px;
          vertical-align: middle;
          border-bottom: 1px solid rgba(148, 163, 184, 0.14);
        }

        .gl-classes-table tr:last-child td {
          border-bottom: 0;
        }

        .gl-classes-table tbody tr:hover td {
          background: #2a3a51;
        }

        .gl-subject-text {
          color: #ffffff;
          font-weight: 900;
          white-space: nowrap;
        }

        .gl-title-text {
          min-width: 180px;
          max-width: 260px;
          line-height: 1.45;
        }

        .gl-teacher-text {
          min-width: 130px;
          white-space: nowrap;
        }

        .gl-time-clean {
          min-width: 260px;
          max-width: 310px;
        }

        .gl-time-main {
          color: #ffffff;
          font-size: 14px;
          font-weight: 900;
          line-height: 1.4;
          white-space: nowrap;
        }

        .gl-time-prefix {
          color: #93c5fd;
          font-weight: 900;
        }

        .gl-time-sub {
          margin-top: 6px;
          color: #9fb0c8;
          font-size: 11px;
          font-weight: 700;
          line-height: 1.4;
        }

        .gl-time-sub strong {
          color: #cbd5e1;
          font-weight: 900;
        }

        .gl-details-footer {
          padding: 16px 26px;
          border-top: 1px solid rgba(148, 163, 184, 0.20);
          background: #202e42;
          display: flex;
          justify-content: flex-end;
        }

        .gl-close-btn {
          border-radius: 12px;
          padding: 10px 20px;
          color: #dbe4f0;
          border: 1px solid rgba(148, 163, 184, 0.35);
          background: rgba(15, 23, 42, 0.24);
          font-weight: 800;
          transition: all 0.2s ease;
        }

        .gl-close-btn:hover {
          background: rgba(148, 163, 184, 0.15);
          color: #ffffff;
        }

        @media (max-width: 767px) {
          .gl-details-modal {
            width: 100%;
            max-height: 94vh;
          }

          .gl-details-header,
          .gl-details-body,
          .gl-details-footer {
            padding-left: 16px;
            padding-right: 16px;
          }

          .gl-details-title {
            font-size: 25px;
          }

          .gl-desc-title {
            font-size: 20px;
          }

          .gl-classes-table {
            min-width: 1180px;
          }
        }
      `}</style>

      <div className="gl-details-modal" onClick={(e) => e.stopPropagation()}>
        <div className="gl-details-header d-flex justify-content-between align-items-start gap-3">
          <div>
            <h2 className="gl-details-title">{programme.programme_name}</h2>

            <div className="gl-details-stage">
              {programme.programme_stage || "-"}
            </div>

            <div className="mt-2 d-flex flex-wrap gap-2">
              <span className={`badge ${getStatusBadgeClass(programme.status)}`}>
                {getStatusLabel(programme.status || "active")}
              </span>

              {programme.group_batch_id ? (
                <span className="badge bg-secondary">
                  Batch #{programme.group_batch_id}
                </span>
              ) : programme.createddate ? (
                <span className="badge bg-secondary">
                  Batch: {formatDate(programme.createddate)}
                </span>
              ) : null}
            </div>
          </div>

          <button
            type="button"
            className="gl-details-close-icon"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="gl-details-body">
          <div className="row g-3 mb-4">
            <div className="col-xl-3 col-md-6">
              <div className="gl-stat-card">
                <div className="gl-stat-label">Group Session Price</div>
                <div className="gl-stat-value">
                  AED {Number(programme.weekly_price || 0).toFixed(2)}
                </div>
              </div>
            </div>

            <div className="col-xl-3 col-md-6">
              <div className="gl-stat-card">
                <div className="gl-stat-label">Weekly Classes</div>
                <div className="gl-stat-value">
                  {baseClassCount} {baseClassCount === 1 ? "Class" : "Classes"}
                  {recurringWeeksCount > 1 ? (
                    <div
                      style={{
                        fontSize: 12,
                        color: "#9fb0c8",
                        marginTop: 6,
                      }}
                    >
                      {recurringWeeksCount} weeks • {totalSessionCount} total sessions
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="col-xl-3 col-md-6">
              <div className="gl-stat-card">
                <div className="gl-stat-label">Capacity</div>
                <div className="gl-stat-value">{programme.capacity || "-"}</div>
              </div>
            </div>

            <div className="col-xl-3 col-md-6">
              <div className="gl-stat-card">
                <div className="gl-stat-label">Seats Left</div>
                <div className="gl-stat-value">
                  {programme.seats_left ?? "-"}
                </div>
              </div>
            </div>
          </div>

          <div className="mb-4">
            <h5 className="gl-desc-title">Curriculum Description</h5>
            <p className="gl-desc-text">
              {programme.programme_description || "-"}
            </p>
          </div>

          <div className="gl-classes-card">
            <div className="gl-classes-title">
              <span>Curriculum Classes</span>

              <span className="badge bg-primary">
                {baseClassCount} {baseClassCount === 1 ? "Class" : "Classes"} / week
              </span>

              <span className="badge bg-info">
                Showing {totalSessionCount} total session{totalSessionCount === 1 ? "" : "s"}
              </span>

              {recurringWeeksCount > 1 ? (
                <span className="badge bg-secondary">
                  {recurringWeeksCount} weeks
                </span>
              ) : null}
            </div>

            <div className="gl-table-scroll">
              <table className="gl-classes-table">
                <thead>
                  <tr>
                    <th>S.L</th>
                    <th>Week</th>
                    <th>Subject</th>
                    <th>Title</th>
                    <th>Teacher</th>
                    <th>Assistant Teachers</th>
                    <th>Date</th>
                    <th>Slot</th>
                    <th>Capacity</th>
                    <th>Booked</th>
                    <th>Status</th>
                  </tr>
                </thead>

                <tbody>
                  {sessions.length === 0 ? (
                    <tr>
                      <td colSpan="11" className="text-center py-4">
                        No classes added for this curriculum.
                      </td>
                    </tr>
                  ) : (
                    sessions.map((session, index) => {
                      const converted = convertSessionToPortalTimezone(session);
                      const teacherTimezone = getTeacherTimezoneLabel(session);

                      const teacherStart = formatTime(
                        normaliseTime(session?.slot_start || "")
                      );

                      const teacherEnd = formatTime(
                        normaliseTime(session?.slot_end || "")
                      );

                      return (
                        <tr key={session?.id || index}>
                          <td>{index + 1}</td>

                          <td>
                            <span className="badge bg-secondary">
                              Week {getRecurrenceWeekNo(session)}
                            </span>
                            <div className="gl-time-sub mt-1">
                              Class {getRecurrenceDayNo(session, index)}
                            </div>
                          </td>

                          <td>
                            <div className="gl-subject-text">
                              {session?.subjectname || "-"}
                            </div>
                          </td>

                          <td>
                            <div className="gl-title-text">
                              {session?.title || "-"}
                            </div>
                          </td>

                          <td>
                            <div className="gl-teacher-text">
                              {session?.teacher_name || "-"}
                            </div>
                          </td>

                          <td>
                            <div className="gl-teacher-text">
                              {getAssistantTeachersLabel(session)}
                            </div>
                          </td>

                          <td>
                            <div className="gl-time-clean">
                              <div className="gl-time-main">
                                <span className="gl-time-prefix">
                                  Admin Asia/Dubai:
                                </span>{" "}
                                {converted.date}
                              </div>

                              <div className="gl-time-sub">
                                <strong>Teacher:</strong>{" "}
                                {formatDate(session?.session_date)}
                              </div>
                            </div>
                          </td>

                          <td>
                            <div className="gl-time-clean">
                              <div className="gl-time-main">
                                <span className="gl-time-prefix">
                                  Admin Asia/Dubai:
                                </span>{" "}
                                {converted.slot}
                              </div>

                              <div className="gl-time-sub">
                                <strong>Teacher:</strong> {teacherStart} -{" "}
                                {teacherEnd}
                                <br />
                                {teacherTimezone}
                              </div>
                            </div>
                          </td>

                          <td>{session?.capacity || "-"}</td>

                          <td>{session?.booked_count ?? 0}</td>

                          <td>
                            <div className="d-flex flex-column align-items-start gap-1">
                              <span
                                className={`badge ${getStatusBadgeClass(
                                  session?.status
                                )}`}
                              >
                                {getStatusLabel(session?.status)}
                              </span>

                              {isGroupViewSessionPassed(session) ? (
                                <span className="badge bg-secondary">
                                  Passed
                                </span>
                              ) : (
                                <span className="badge bg-success">
                                  Upcoming
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="gl-details-footer">
          <button type="button" className="gl-close-btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

const GroupLiveSessionsLayer = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const ITEMS_PER_PAGE = 10;
  const [currentPage, setCurrentPage] = useState(1);

  const [statusDraftMap, setStatusDraftMap] = useState({});
  const [savingStatusMap, setSavingStatusMap] = useState({});

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedProgrammeForCreate, setSelectedProgrammeForCreate] =
    useState(null);
  const [createModalMode, setCreateModalMode] = useState("create");

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedProgrammeDetails, setSelectedProgrammeDetails] =
    useState(null);

  const [bookingOpen, setBookingOpen] = useState(false);
  const [selectedProgrammeForBooking, setSelectedProgrammeForBooking] =
    useState(null);

  const [weeklyTimetableOpen, setWeeklyTimetableOpen] = useState(false);
  const [groupProgrammeModalOpen, setGroupProgrammeModalOpen] = useState(false);

  const buildHeaders = async () => {
    const tokenRes = await getToken();
    const token = resolveToken(tokenRes);

    return {
      ...API_HEADERS,
      ...(token ? { token } : {}),
    };
  };

  const getTokenValue = async () => {
    const tokenRes = await getToken();
    return resolveToken(tokenRes);
  };

  const fetchGroupLiveSessions = useCallback(async () => {
    setLoading(true);
    setLoadError("");

    try {
      const headers = await buildHeaders();

      const response = await axios.post(
        RUN_STORED_PROCEDURE_URL,
        {
          procedureName: "sp_get_group_live_sessions_list",
        },
        { headers }
      );

      if (Number(response?.data?.statusCode) !== 200) {
        throw new Error(
          response?.data?.message || "Group live sessions could not be loaded."
        );
      }

      const list = extractRows(response.data);
      setRows(Array.isArray(list) ? list : []);
    } catch (error) {
      console.error("Group live sessions load failed:", error);
      setRows([]);
      setLoadError(error?.message || "Group live sessions could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGroupLiveSessions();
  }, [fetchGroupLiveSessions]);

  const filteredRows = useMemo(() => {
    const search = String(searchTerm || "").toLowerCase().trim();

    return (rows || []).filter((item) => {
      const fullText = [
        item?.programme_name,
        item?.programme_stage,
        item?.programme_description,
        item?.title,
        item?.subjectname,
        item?.teacher_name,
        item?.assistant_teacher_names,
        item?.assistant_teacher_ids,
        item?.session_date,
        item?.slot_start,
        item?.slot_end,
        item?.status,
        item?.group_batch_id,
        item?.group_batch_week_id,
        item?.week_no,
        item?.class_order,
        item?.recurrence_total_weeks,
        item?.recurrence_week_no,
        item?.recurrence_day_no,
      ]
        .join(" ")
        .toLowerCase();

      return !search || fullText.includes(search);
    });
  }, [rows, searchTerm]);

  const groupedProgrammes = useMemo(() => {
    const map = {};

    (filteredRows || []).forEach((item) => {
      if (!isSessionVisible(item)) return;

      const programmeId = String(item?.programme_id || "unknown");
      const status = String(item?.status || "active").toLowerCase();
      const groupBatchId = getGroupBatchId(item);

      const batchKey =
        groupBatchId > 0
          ? `batch_${groupBatchId}`
          : getWeekKey(item?.session_date);

      const groupKey = [programmeId, batchKey].join("_");

      if (!map[groupKey]) {
        map[groupKey] = {
          group_key: groupKey,
          programme_id: item?.programme_id,
          group_batch_id: groupBatchId,
          show_on_web: Number(item?.show_on_web ?? 1),
          web_sort_order: Number(item?.web_sort_order || 0),
          web_visibility:
            Number(item?.show_on_web ?? 1) === 1 ? "Public" : "Private",
          programme_name: item?.programme_name || "-",
          programme_stage: item?.programme_stage || "-",
          programme_description: item?.programme_description || "",
          weekly_price: item?.weekly_price || 0,
          capacity: item?.capacity || 0,
          status:
            item?.curriculum_status ||
            item?.status ||
            "active",
          createddate: item?.createddate || "",
          batch_key: batchKey,
          batch_label:
            groupBatchId > 0
              ? `Batch #${groupBatchId}`
              : `Batch: ${formatDate(item?.createddate)}`,
          week_key: getWeekKey(item?.session_date),
          sessions: [],
        };
      }

      map[groupKey].sessions.push({
        ...item,
        week_no: getSessionWeekNo(item),
        actual_week_no: getSessionWeekNo(item),
        recurrence_week_no: getSessionWeekNo(item),
        class_order: getSessionClassOrder(item),
        recurrence_day_no: getSessionClassOrder(item),
        timezone_location:
          item?.timezone_location ||
          item?.teacher_timezone_location ||
          item?.source_timezone ||
          item?.timezone ||
          "",
        timezone:
          item?.timezone ||
          item?.timezone_location ||
          item?.teacher_timezone_location ||
          item?.source_timezone ||
          "",
      });
    });

    return Object.values(map)
      .map((programme) => {
        const allSessions = dedupeExactSessionDuplicates(programme.sessions);

        const nonCancelledSessions = allSessions.filter(
          (session) => !isCancelledStatus(session?.status)
        );

        // If some sessions are still valid, removed/cancelled classes
        // must not create/count as a separate curriculum.
        // If ALL sessions are cancelled, keep them so the whole
        // cancelled curriculum can still be displayed.
        const sessions =
          nonCancelledSessions.length > 0
            ? nonCancelledSessions
            : allSessions;

        const baseSessions = getBaseSessionsFromList(sessions);

        const sessionStatuses = sessions.map((session) =>
          String(session?.status || "active").toLowerCase()
        );

        let programmeStatus = "active";

        if (sessionStatuses.includes("active")) {
          programmeStatus = "active";
        } else if (sessionStatuses.includes("paused")) {
          programmeStatus = "paused";
        } else if (sessionStatuses.includes("completed")) {
          programmeStatus = "completed";
        } else if (
          sessionStatuses.length > 0 &&
          sessionStatuses.every((status) => status === "cancelled")
        ) {
          programmeStatus = "cancelled";
        }

        const capacities = sessions.map((s) => Number(s?.capacity || 0));
        const seats = sessions.map((s) =>
          Number(s?.seats_left ?? s?.capacity ?? 0)
        );
        const bookedCounts = sessions.map((s) => Number(s?.booked_count || 0));

        const programmeCapacity = capacities.length
          ? Math.max(...capacities)
          : Number(programme.capacity || 0);

        const programmeSeatsLeft = seats.length
          ? Math.min(...seats)
          : programmeCapacity;

        const bookedSessions = bookedCounts.length
          ? Math.max(...bookedCounts)
          : Math.max(programmeCapacity - programmeSeatsLeft, 0);

        const recurrenceTotalWeeks = getProgrammeRecurringWeeksCount({
          ...programme,
          sessions,
        });

        return {
          ...programme,

          // Whole curriculum status from SP
          status: programme?.status || programmeStatus,

          // Existing operational sessions
          // Booking/Edit/list isi ko use karte rahenge
          sessions,

          // View modal ko complete history milegi
          all_sessions: allSessions,

          base_sessions: baseSessions,
          base_classes: baseSessions.length,
          recurrence_total_weeks: recurrenceTotalWeeks,
          total_sessions: sessions.length,
          total_classes: baseSessions.length,
          capacity: programmeCapacity,
          seats_left: programmeSeatsLeft,
          booked_count: bookedSessions,
        };
      })
      .filter((programme) => {
        const selectedStatus = String(
          statusFilter || ""
        ).toLowerCase().trim();

        if (!selectedStatus) return true;

        return (
          String(programme?.status || "")
            .toLowerCase()
            .trim() === selectedStatus
        );
      })
      .sort((a, b) => {
        const statusOrder = {
          active: 1,
          paused: 2,
          completed: 3,
          cancelled: 4,
        };

        const sa = statusOrder[String(a.status || "").toLowerCase()] || 9;
        const sb = statusOrder[String(b.status || "").toLowerCase()] || 9;

        if (sa !== sb) return sa - sb;

        const wa =
          Number(a.web_sort_order || 0) === 0
            ? 999999
            : Number(a.web_sort_order || 0);

        const wb =
          Number(b.web_sort_order || 0) === 0
            ? 999999
            : Number(b.web_sort_order || 0);

        if (wa !== wb) return wa - wb;

        const ba = Number(a.group_batch_id || 0);
        const bb = Number(b.group_batch_id || 0);

        if (ba !== bb) return bb - ba;

        const ca =
          moment(a.createddate, "YYYY-MM-DD HH:mm:ss", true).valueOf() || 0;
        const cb =
          moment(b.createddate, "YYYY-MM-DD HH:mm:ss", true).valueOf() || 0;

        if (ca !== cb) return cb - ca;

        return Number(a.programme_id) - Number(b.programme_id);
      });
  }, [filteredRows, statusFilter]);

  const totalPages = Math.max(
    1,
    Math.ceil(groupedProgrammes.length / ITEMS_PER_PAGE)
  );

  const paginatedProgrammes = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;

    return groupedProgrammes.slice(startIndex, endIndex);
  }, [groupedProgrammes, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const patchRowsStatus = (sessionIds, nextStatus) => {
    const idSet = new Set(sessionIds.map((id) => String(id)));

    setRows((prev) =>
      prev.map((row) =>
        idSet.has(String(row?.id))
          ? {
            ...row,
            status: nextStatus,
          }
          : row
      )
    );
  };

  const updateSingleSessionStatus = async (sessionId, nextStatus, token) => {
    const conditionId = /^\d+$/.test(String(sessionId))
      ? Number(sessionId)
      : sessionId;

    const payload = {
      token,
      tablename: "group_live_sessions",
      conditions: [
        {
          id: conditionId,
        },
      ],
      updatedata: [
        {
          status: nextStatus,
        },
      ],
    };

    const response = await axios.post(UPDATE_DYNAMIC_DATA_URL, payload, {
      headers: API_HEADERS,
    });

    if (Number(response?.data?.statusCode) !== 200) {
      throw new Error(
        response?.data?.message ||
        `Session ID ${sessionId} status update failed.`
      );
    }

    return response.data;
  };

  const handleStatusDraftChange = (groupKey, value) => {
    setStatusDraftMap((prev) => ({
      ...prev,
      [groupKey]: value,
    }));
  };

  const isStatusSaving = (groupKey) => {
    return !!savingStatusMap[String(groupKey)];
  };

  const setStatusSaving = (groupKey, saving) => {
    setSavingStatusMap((prev) => ({
      ...prev,
      [String(groupKey)]: saving,
    }));
  };

  const handleSaveBatchStatus = async (programme) => {
    const groupKey = programme?.group_key;
    const currentStatus = String(programme?.status || "active").toLowerCase();

    const nextStatus = String(
      statusDraftMap[groupKey] || currentStatus
    ).toLowerCase();

    if (!groupKey) {
      Swal.fire({
        icon: "error",
        title: "Group Missing",
        text: "Curriculum group key not found.",
      });
      return;
    }

    if (currentStatus === "completed") {
      Swal.fire({
        icon: "info",
        title: "Already Completed",
        text: "Completed batch status cannot be changed.",
        timer: 1600,
        timerProgressBar: true,
      });
      return;
    }

    if (!STATUS_OPTIONS.includes(nextStatus)) {
      Swal.fire({
        icon: "error",
        title: "Invalid Status",
        text: "Please select a valid status.",
      });
      return;
    }

    if (nextStatus === currentStatus) {
      Swal.fire({
        icon: "info",
        title: "No Changes",
        text: "Status is already the same.",
        timer: 1600,
        timerProgressBar: true,
      });
      return;
    }

    const programmeSessions = programme?.sessions || [];

    const hasNonCancelledSessions = programmeSessions.some(
      (session) => !isCancelledStatus(session?.status)
    );

    const sessionIds = programmeSessions
      .filter((session) => {
        // If whole batch is being cancelled, update everything.
        if (nextStatus === "cancelled") {
          return true;
        }

        // If every session is currently cancelled, allow the whole batch
        // to be changed back to another status.
        if (!hasNonCancelledSessions) {
          return true;
        }

        // Mixed batch:
        // keep individually removed/cancelled classes cancelled.
        return !isCancelledStatus(session?.status);
      })
      .map((session) => session?.id)
      .filter(Boolean);

    if (sessionIds.length === 0) {
      Swal.fire({
        icon: "error",
        title: "Sessions Missing",
        text: "No sessions found for this programme batch.",
      });
      return;
    }

    const confirmResult = await Swal.fire({
      icon: "warning",
      title: "Update Status?",
      html: `
        <div style="text-align:center; line-height:1.7;">
          <div>Are you sure you want to update this curriculum batch status?</div>
          <div style="margin-top:10px;">
            <strong>Curriculum:</strong> ${programme?.programme_name || "-"}<br/>
            <strong>Total Sessions:</strong> ${sessionIds.length}<br/>
            <strong>Current:</strong> ${getStatusLabel(currentStatus)}<br/>
            <strong>New:</strong> ${getStatusLabel(nextStatus)}
          </div>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: "Yes, Update",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#3085d6",
      cancelButtonColor: "#6c757d",
      reverseButtons: true,
    });

    if (!confirmResult.isConfirmed) return;

    setStatusSaving(groupKey, true);

    const previousStatus = currentStatus;

    patchRowsStatus(sessionIds, nextStatus);

    try {
      const token = await getTokenValue();

      if (!token) {
        throw new Error("Token not found.");
      }

      for (const sessionId of sessionIds) {
        await updateSingleSessionStatus(sessionId, nextStatus, token);
      }

      setStatusDraftMap((prev) => ({
        ...prev,
        [groupKey]: nextStatus,
      }));

      await Swal.fire({
        icon: "success",
        title: "Updated Successfully",
        text: "Curriculum batch status has been updated successfully.",
        confirmButtonText: "OK",
        timer: 1700,
        timerProgressBar: true,
      });

      await fetchGroupLiveSessions();
    } catch (err) {
      patchRowsStatus(sessionIds, previousStatus);

      setStatusDraftMap((prev) => ({
        ...prev,
        [groupKey]: previousStatus,
      }));

      Swal.fire({
        icon: "error",
        title: "Update Failed",
        text: err?.message || "Something went wrong while updating status.",
      });
    } finally {
      setStatusSaving(groupKey, false);
    }
  };

  const openCreateModal = (programme = null) => {
    setCreateModalMode("create");
    setSelectedProgrammeForCreate(programme);
    setIsCreateOpen(true);
  };

  const openEditModal = (programme) => {
    if (!programme) {
      Swal.fire({
        icon: "error",
        title: "Curriculum Missing",
        text: "Curriculum data not found.",
      });
      return;
    }

    const bookedCount = getProgrammeBookedCount(programme);
    const teacherOnlyEdit = bookedCount > 0;

    setCreateModalMode("edit");

    setSelectedProgrammeForCreate({
      ...programme,
      _booked_count: bookedCount,
      _teacher_only_edit: teacherOnlyEdit,
      _lock_curriculum: teacherOnlyEdit,
    });

    setIsCreateOpen(true);
  };

  const closeCreateModal = () => {
    setIsCreateOpen(false);
    setSelectedProgrammeForCreate(null);
    setCreateModalMode("create");
  };

  const handleCreateSuccess = () => {
    setIsCreateOpen(false);
    setSelectedProgrammeForCreate(null);
    setCreateModalMode("create");
    fetchGroupLiveSessions();
  };

  const openDetailsModal = (programme) => {
    setSelectedProgrammeDetails(programme);
    setDetailsOpen(true);
  };

  const closeDetailsModal = () => {
    setSelectedProgrammeDetails(null);
    setDetailsOpen(false);
  };

  const openBookingModal = (programme) => {
    setSelectedProgrammeForBooking(programme);
    setBookingOpen(true);
  };

  const closeBookingModal = () => {
    setSelectedProgrammeForBooking(null);
    setBookingOpen(false);
  };

  const openWeeklyTimetableModal = () => {
    setWeeklyTimetableOpen(true);
  };

  const closeWeeklyTimetableModal = () => {
    setWeeklyTimetableOpen(false);
  };

  const openGroupProgrammeModal = () => {
    setGroupProgrammeModalOpen(true);
  };

  const closeGroupProgrammeModal = () => {
    setGroupProgrammeModalOpen(false);
  };

  return (
    <div className="card h-100 p-0 radius-12">
      <style>{`
        .gl-main-table thead th {
          white-space: nowrap;
        }

        .gl-main-table tbody td {
          vertical-align: middle;
        }

        .gl-programme-title {
          color: var(--bs-emphasis-color) !important;
          font-weight: 800;
        }

        .gl-programme-desc {
          max-width: 420px;
          color: var(--bs-secondary-color) !important;
          font-size: 13px;
          line-height: 1.5;
        }

        .gl-batch-text {
          color: var(--bs-secondary-color) !important;
          font-size: 12px;
          font-weight: 600;
          margin-top: 4px;
        }

        .gl-status-update-wrap {
          min-width: 210px;
        }

        .gl-status-update-row {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .gl-status-select {
          min-width: 116px;
          height: 34px;
          font-size: 13px;
          font-weight: 700;
          text-transform: capitalize;
        }

        .gl-status-save-btn {
          height: 34px;
          padding: 4px 10px;
          font-size: 12px;
          font-weight: 800;
          white-space: nowrap;
        }

        [data-bs-theme="dark"] .gl-programme-title,
        [data-theme="dark"] .gl-programme-title,
        .dark .gl-programme-title,
        body.dark .gl-programme-title {
          color: #ffffff !important;
        }

        [data-bs-theme="dark"] .gl-programme-desc,
        [data-theme="dark"] .gl-programme-desc,
        .dark .gl-programme-desc,
        body.dark .gl-programme-desc,
        [data-bs-theme="dark"] .gl-batch-text,
        [data-theme="dark"] .gl-batch-text,
        .dark .gl-batch-text,
        body.dark .gl-batch-text {
          color: #b8c4d6 !important;
        }

        .gl-create-btn,
        .gl-weekly-btn,
        .gl-group-programme-btn {
          border-radius: 999px;
          padding: 10px 18px;
          width: fit-content;
          max-width: fit-content;
          flex: 0 0 auto;
          font-weight: 800;
        }

        .gl-group-programme-btn {
          color: #f59e0b !important;
          border: 1px solid #f59e0b !important;
          background: transparent !important;
          box-shadow: 0 10px 24px rgba(245, 158, 11, 0.14);
        }

        .gl-create-btn {
          box-shadow: 0 10px 24px rgba(25, 135, 84, 0.20);
        }

        .gl-create-plus {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: rgba(255,255,255,0.22);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-weight: 900;
          line-height: 1;
        }

        .gl-action-btn {
          min-width: 82px;
          justify-content: center;
          border-radius: 8px;
          font-weight: 800;
        }

        .gl-action-edit-btn {
          color: #111827 !important;
        }

        .gl-action-edit-btn:disabled {
          opacity: 0.52;
          cursor: not-allowed;
          color: #111827 !important;
        }

        .gl-visibility-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          width: fit-content;
          margin-top: 8px;
          padding: 5px 12px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0.2px;
          line-height: 1;
        }

        .gl-visibility-public {
          color: #ffffff !important;
          background: #16a34a !important;
          border: 1px solid #22c55e !important;
          box-shadow: 0 6px 16px rgba(34, 197, 94, 0.22);
        }

        .gl-visibility-private {
          color: #ffffff !important;
          background: #ea580c !important;
          border: 1px solid #fb923c !important;
          box-shadow: 0 6px 16px rgba(249, 115, 22, 0.22);
        }

        .gl-visibility-badge svg {
          color: #ffffff !important;
          font-size: 13px;
        }
      `}</style>

      <div className="card-body p-24">
        <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-4">
          <div>
            <h5 className="mb-1">Live Group Curriculums</h5>
            <p className="text-secondary-light mb-0"></p>
          </div>

          <div className="d-flex flex-wrap align-items-center gap-2">
            <button
              type="button"
              className="btn btn-outline-primary btn-sm d-inline-flex align-items-center gap-2 gl-weekly-btn"
              onClick={openWeeklyTimetableModal}
            >
              <Icon icon="mdi:calendar-week-outline" />
              Weekly Timetable
            </button>

            <button
              type="button"
              className="btn btn-outline-info btn-sm d-inline-flex align-items-center gap-2 gl-group-programme-btn"
              onClick={openGroupProgrammeModal}
            >
              <Icon icon="mdi:playlist-plus" />
              Create Group Curriculum
            </button>

            <button
              type="button"
              className="btn btn-success btn-sm d-inline-flex align-items-center gap-2 gl-create-btn"
              onClick={() => openCreateModal(null)}
            >
              <span className="gl-create-plus">+</span>
              Create Live Group
            </button>
          </div>
        </div>

        <div className="d-flex flex-wrap align-items-center gap-3 mb-4">
          <input
            type="text"
            className="form-control"
            style={{ maxWidth: 340 }}
            placeholder="Search curriculum..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />

          <select
            className="form-select"
            style={{ maxWidth: 220 }}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">Status: All</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>

          <button
            type="button"
            className="btn btn-outline-secondary"
            onClick={() => {
              setSearchTerm("");
              setStatusFilter("");
            }}
          >
            Reset
          </button>
        </div>

        {loadError ? (
          <div className="alert alert-danger py-2">{loadError}</div>
        ) : null}

        {loading ? (
          <div className="py-5 text-center">
            <div className="spinner-border text-primary" role="status" />
            <div className="mt-2 text-secondary-light">
              Loading live group curriculums...
            </div>
          </div>
        ) : (
          <>
            <div className="table-responsive">
              <table className="table bordered-table mb-0 gl-main-table">
                <thead>
                  <tr>
                    <th>S.L</th>
                    <th>Curriculum</th>
                    <th>Stage</th>
                    <th>Group Session Price</th>
                    <th>Classes</th>
                    <th>Capacity</th>
                    <th>Booked Seats</th>
                    <th>Seats Left</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>

                <tbody>
                  {groupedProgrammes.length === 0 ? (
                    <tr>
                      <td
                        colSpan="10"
                        className="text-center py-4 text-secondary-light"
                      >
                        No live group curriculums found.
                      </td>
                    </tr>
                  ) : (
                    paginatedProgrammes.map((programme, index) => {
                      const groupKey =
                        programme.group_key ||
                        `${programme.programme_id}_${programme.status}_${programme.createddate}_${index}`;

                      const saving = isStatusSaving(groupKey);

                      const currentStatus = String(
                        programme.status || "active"
                      ).toLowerCase();

                      const draftStatus = String(
                        statusDraftMap[groupKey] || currentStatus
                      ).toLowerCase();

                      const isCompleted = currentStatus === "completed";
                      const isActive = currentStatus === "active";
                      const bookedCount = getProgrammeBookedCount(programme);
                      const editAllowed = true;
                      const hasBookings = bookedCount > 0;

                      const weeklyClasses = Number(
                        programme.base_classes || programme.total_classes || 0
                      );

                      return (
                        <tr key={groupKey}>
                          <td>
                            {(currentPage - 1) * ITEMS_PER_PAGE + index + 1}
                          </td>

                          <td>
                            <div className="gl-programme-title">
                              {programme.programme_name}
                            </div>

                            <div className="gl-programme-desc">
                              {getShortDescription(
                                programme.programme_description,
                                95
                              )}
                            </div>

                            {programme.group_batch_id ? (
                              <div className="gl-batch-text">
                                Batch #{programme.group_batch_id}
                              </div>
                            ) : programme.createddate ? (
                              <div className="gl-batch-text">
                                Batch: {formatDate(programme.createddate)}
                              </div>
                            ) : null}

                            <div
                              className={`gl-visibility-badge ${Number(programme.show_on_web ?? 1) === 1
                                ? "gl-visibility-public"
                                : "gl-visibility-private"
                                }`}
                            >
                              <Icon
                                icon={
                                  Number(programme.show_on_web ?? 1) === 1
                                    ? "mdi:eye-outline"
                                    : "mdi:eye-off-outline"
                                }
                              />
                              {Number(programme.show_on_web ?? 1) === 1
                                ? "Public"
                                : "Private"}
                            </div>

                            <div className="gl-batch-text">
                              Web Sort Order:{" "}
                              <strong>
                                {Number(programme.web_sort_order || 0) === 0
                                  ? "Default"
                                  : programme.web_sort_order}
                              </strong>
                            </div>
                          </td>

                          <td>{programme.programme_stage || "-"}</td>

                          <td>
                            AED {Number(programme.weekly_price || 0).toFixed(2)}
                          </td>

                          <td>
                            <span className="badge bg-success">
                              {weeklyClasses}{" "}
                              {weeklyClasses === 1 ? "Class" : "Classes"} / week
                            </span>

                            {Number(programme.recurrence_total_weeks || 1) > 1 ? (
                              <div className="gl-batch-text mt-1">
                                {Number(programme.recurrence_total_weeks || 1)} weeks •{" "}
                                {Number(programme.total_sessions || 0)} total sessions
                              </div>
                            ) : null}
                          </td>

                          <td>{programme.capacity || "-"}</td>
                          <td>{bookedCount}</td>
                          <td>{programme.seats_left ?? "-"}</td>

                          <td>
                            {isCompleted ? (
                              <div className="gl-status-update-wrap">
                                <span
                                  className={`badge ${getStatusBadgeClass(
                                    currentStatus
                                  )}`}
                                >
                                  {getStatusLabel(currentStatus)}
                                </span>
                              </div>
                            ) : (
                              <div className="gl-status-update-wrap">
                                <div className="mb-1">
                                  <span
                                    className={`badge ${getStatusBadgeClass(
                                      currentStatus
                                    )}`}
                                  >
                                    Current: {getStatusLabel(currentStatus)}
                                  </span>
                                </div>

                                <div className="gl-status-update-row">
                                  <select
                                    className="form-select form-select-sm gl-status-select"
                                    value={draftStatus}
                                    disabled={saving}
                                    onChange={(e) =>
                                      handleStatusDraftChange(
                                        groupKey,
                                        e.target.value
                                      )
                                    }
                                  >
                                    {STATUS_OPTIONS.map((status) => (
                                      <option key={status} value={status}>
                                        {getStatusLabel(status)}
                                      </option>
                                    ))}
                                  </select>

                                  <button
                                    type="button"
                                    className="btn btn-sm btn-outline-primary gl-status-save-btn"
                                    disabled={
                                      saving || draftStatus === currentStatus
                                    }
                                    onClick={() =>
                                      handleSaveBatchStatus(programme)
                                    }
                                  >
                                    {saving ? "Saving..." : "Save"}
                                  </button>
                                </div>
                              </div>
                            )}
                          </td>

                          <td>
                            <div className="d-flex gap-2 flex-wrap">
                              <button
                                type="button"
                                className="btn btn-sm btn-primary d-inline-flex align-items-center gap-1 gl-action-btn"
                                onClick={() => openDetailsModal(programme)}
                              >
                                <Icon icon="mdi:eye-outline" />
                                View
                              </button>

                              <button
                                type="button"
                                className="btn btn-sm btn-warning d-inline-flex align-items-center gap-1 gl-action-btn gl-action-edit-btn"
                                disabled={!editAllowed}
                                title={
                                  hasBookings
                                    ? "Update Teachers & Assistant Teachers"
                                    : "Edit Curriculum"
                                }
                                onClick={() => openEditModal(programme)}
                              >
                                <Icon icon="mdi:pencil-outline" />
                                {hasBookings ? "Teachers" : "Edit"}
                              </button>

                              {isActive ? (
                                <button
                                  type="button"
                                  className="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-1 gl-copy-link-btn"
                                  onClick={async () => {
                                    const link = `https://gostudy.ae/group-tuition/${programme.programme_id}${programme.group_batch_id
                                      ? `?group_batch_id=${programme.group_batch_id}`
                                      : ""
                                      }`;

                                    try {
                                      await navigator.clipboard.writeText(link);

                                      Swal.fire({
                                        icon: "success",
                                        title: "Link Copied",
                                        text: "The batch direct link has been copied successfully.",
                                        timer: 1300,
                                        showConfirmButton: false,
                                      });
                                    } catch (err) {
                                      Swal.fire({
                                        icon: "info",
                                        title: "Copy Batch Link",
                                        html: `<div style="word-break:break-all;">${link}</div>`,
                                      });
                                    }
                                  }}
                                >
                                  <Icon icon="mdi:link-variant" />
                                  Copy Link
                                </button>
                              ) : null}

                              {isActive ? (
                                <button
                                  type="button"
                                  className="btn btn-sm btn-success d-inline-flex align-items-center gap-1 gl-action-btn"
                                  onClick={() => openBookingModal(programme)}
                                >
                                  <Icon icon="mdi:calendar-plus-outline" />
                                  Book
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>

            </div>
            {groupedProgrammes.length > 0 && (
              <div
                className="d-flex flex-wrap align-items-center justify-content-between gap-3 mt-3 px-2 pb-2"
                style={{ minHeight: "54px" }}
              >
                {/* Left Side */}
                <div className="text-secondary-light">
                  Showing{" "}
                  <strong>
                    {(currentPage - 1) * ITEMS_PER_PAGE + 1}
                  </strong>{" "}
                  to{" "}
                  <strong>
                    {Math.min(
                      currentPage * ITEMS_PER_PAGE,
                      groupedProgrammes.length
                    )}
                  </strong>{" "}
                  of{" "}
                  <strong>{groupedProgrammes.length}</strong>{" "}
                  entries
                </div>

                {/* Right Side */}
                <div className="d-flex align-items-center gap-2">
                  <button
                    type="button"
                    className="btn btn-outline-secondary btn-sm"
                    style={{
                      minWidth: "88px",
                      height: "40px",
                    }}
                    disabled={currentPage === 1}
                    onClick={() =>
                      setCurrentPage((prev) => Math.max(prev - 1, 1))
                    }
                  >
                    Previous
                  </button>

                  <div
                    className="px-1"
                    style={{
                      minWidth: "90px",
                      textAlign: "center",
                      whiteSpace: "nowrap",
                      fontWeight: 500,
                    }}
                  >
                    Page {currentPage} of {totalPages}
                  </div>

                  <button
                    type="button"
                    className="btn btn-outline-secondary btn-sm"
                    style={{
                      minWidth: "60px",
                      height: "40px",
                    }}
                    disabled={currentPage === totalPages}
                    onClick={() =>
                      setCurrentPage((prev) =>
                        Math.min(prev + 1, totalPages)
                      )
                    }
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <GroupProgrammeDetailsModal
        open={detailsOpen}
        programme={selectedProgrammeDetails}
        onClose={closeDetailsModal}
      />

      <CreateGroupBatchBookingModal
        open={bookingOpen}
        programme={selectedProgrammeForBooking}
        onClose={closeBookingModal}
        onSuccess={(data) => {
          console.log("GROUP BOOKING CREATED FROM MODAL =>", data);
          closeBookingModal();
          fetchGroupLiveSessions();
        }}
      />

      <CreateLiveGroupModal
        isOpen={isCreateOpen}
        mode={createModalMode}
        editProgramme={
          createModalMode === "edit" ? selectedProgrammeForCreate : null
        }
        preselectedProgramme={
          createModalMode === "create" ? selectedProgrammeForCreate : null
        }
        lockCurriculum={
          createModalMode === "edit" &&
          !!selectedProgrammeForCreate?._lock_curriculum
        }
        teacherOnlyEdit={
          createModalMode === "edit" &&
          !!selectedProgrammeForCreate?._teacher_only_edit
        }
        onClose={closeCreateModal}
        onSuccess={handleCreateSuccess}
      />

      {weeklyTimetableOpen && (
        <WeeklyTimetableModal onClose={closeWeeklyTimetableModal} />
      )}

      <CreateGroupProgrammeModal
        open={groupProgrammeModalOpen}
        onClose={closeGroupProgrammeModal}
        onSuccess={() => {
          fetchGroupLiveSessions();
        }}
      />
    </div>
  );
};

export default GroupLiveSessionsLayer;