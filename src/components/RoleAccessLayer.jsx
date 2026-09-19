import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import moment from "moment-timezone";
import { getAllBookings } from "../api/getAllBookings";
import { getToken } from "../api/getToken";
import ManualBookingModal from "./ManualBookingModal";
import RescheduleBookingModal from "./RescheduleBookingModal";

const UPDATE_DYNAMIC_DATA_URL =
  "https://api.learnyourlanguage.org/RestController_Thirdparty.php?view=update_dynamic_data";

const HARD_DELETE_BOOKING_URL =
  "https://api.learnyourlanguage.org/RestController_Thirdparty.php?view=portal_hard_delete_booking";

const API_HEADERS = {
  projectid: "1",
  userid: "test",
  password: "test",
  "x-api-key": "abc123456789",
  "Content-Type": "application/json",
};

const PAYMENT_STATUS_OPTIONS = ["Paid", "Unpaid", "Free"];
const SESSION_TYPE_OPTIONS = ["Online", "In-Person"];

const DarkSelectEditor = ({
  value,
  options,
  onChange,
  loading,
}) => {
  return (
    <div className="lyl-select-wrap">
      <select
        className="lyl-select"
        value={value}
        onChange={(event) =>
          onChange(event.target.value)
        }
        disabled={loading}
      >
        {options.map((option) => (
          <option
            key={option}
            value={option}
          >
            {option}
          </option>
        ))}
      </select>
    </div>
  );
};

const ConfirmActionModal = ({
  open,
  title,
  message,
  confirmText,
  cancelText,
  loadingText,
  variant = "primary",
  onConfirm,
  onClose,
  loading,
}) => {
  if (!open) {
    return null;
  }

  const isDanger =
    variant === "danger";

  return (
    <div
      className="lyl-modal-overlay"
      onClick={
        loading
          ? undefined
          : onClose
      }
    >
      <div
        className="lyl-modal-card"
        onClick={(event) =>
          event.stopPropagation()
        }
      >
        <div
          className={`lyl-modal-icon ${isDanger
              ? "danger"
              : ""
            }`}
        >
          !
        </div>

        <h4 className="lyl-modal-title">
          {title}
        </h4>

        <p className="lyl-modal-text">
          {message}
        </p>

        <div className="lyl-modal-actions">
          <button
            type="button"
            className="lyl-btn lyl-btn-secondary"
            onClick={onClose}
            disabled={loading}
          >
            {cancelText || "Cancel"}
          </button>

          <button
            type="button"
            className={`lyl-btn ${isDanger
                ? "lyl-btn-danger"
                : "lyl-btn-primary"
              }`}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading
              ? loadingText ||
              "Please wait..."
              : confirmText ||
              "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
};

const AlertToast = ({
  alertData,
  onClose,
}) => {
  if (!alertData?.open) {
    return null;
  }

  return (
    <div
      className={`lyl-toast ${alertData.type ===
          "success"
          ? "success"
          : "error"
        }`}
    >
      <div className="lyl-toast-content">
        <div className="lyl-toast-title">
          {alertData.title}
        </div>

        <div className="lyl-toast-message">
          {alertData.message}
        </div>
      </div>

      <button
        type="button"
        className="lyl-toast-close"
        onClick={onClose}
      >
        ×
      </button>
    </div>
  );
};

const RoleAccessLayer = () => {
  const TZ = "Asia/Dubai";
  const itemsPerPage = 10;

  const [rows, setRows] =
    useState([]);

  const [
    initialLoading,
    setInitialLoading,
  ] = useState(true);

  const [
    loadError,
    setLoadError,
  ] = useState("");

  const [
    searchTerm,
    setSearchTerm,
  ] = useState("");

  const [
    paymentTypeFilter,
    setPaymentTypeFilter,
  ] = useState("");

  const [
    bookingStatusFilter,
    setBookingStatusFilter,
  ] = useState("");

  const [
    paymentStatusFilter,
    setPaymentStatusFilter,
  ] = useState("");

  const [
    sessionTypeFilter,
    setSessionTypeFilter,
  ] = useState("");

  const [
    bookingTypeFilter,
    setBookingTypeFilter,
  ] = useState("");

  const [
    groupFilter,
    setGroupFilter,
  ] = useState("");

  const [
    groupBatchFilter,
    setGroupBatchFilter,
  ] = useState("");

  const [
    startDate,
    setStartDate,
  ] = useState("");

  const [
    endDate,
    setEndDate,
  ] = useState("");

  const [
    currentPage,
    setCurrentPage,
  ] = useState(1);

  const [
    isManualBookingOpen,
    setIsManualBookingOpen,
  ] = useState(false);

  const [
    isRecordingOpen,
    setIsRecordingOpen,
  ] = useState(false);

  const [
    activeRecordingUrl,
    setActiveRecordingUrl,
  ] = useState("");

  const [
    isRescheduleOpen,
    setIsRescheduleOpen,
  ] = useState(false);

  const [
    selectedBooking,
    setSelectedBooking,
  ] = useState(null);

  const [
    savingMap,
    setSavingMap,
  ] = useState({});

  const [
    confirmModal,
    setConfirmModal,
  ] = useState({
    open: false,
    item: null,
    field: "",
    newValue: "",
    title: "",
    message: "",
  });

  const [
    confirmLoading,
    setConfirmLoading,
  ] = useState(false);

  const [
    deleteModal,
    setDeleteModal,
  ] = useState({
    open: false,
    item: null,
  });

  const [
    deletingBookingId,
    setDeletingBookingId,
  ] = useState("");

  const [
    amountDraftMap,
    setAmountDraftMap,
  ] = useState({});

  const [
    alertData,
    setAlertData,
  ] = useState({
    open: false,
    type: "success",
    title: "",
    message: "",
  });

  const norm = (value) =>
    String(value ?? "")
      .toLowerCase()
      .trim();

  const cleanTimezone = (
    value
  ) =>
    String(value || "")
      .replace(/\\\//g, "/")
      .trim();

  const normalizeRecordingUrl = (
    value
  ) =>
    String(value || "")
      .replace(/\\\//g, "/")
      .trim();

  const getStudentTimezone = (
    item
  ) => {
    const timezone =
      cleanTimezone(
        item?.studentTime_zone
      ) ||
      cleanTimezone(
        item?.student_timezone
      ) ||
      cleanTimezone(
        item?.studentTimezone
      ) ||
      cleanTimezone(
        item?.timezone_location
      ) ||
      cleanTimezone(
        item?.timezone
      ) ||
      TZ;

    return moment.tz.zone(
      timezone
    )
      ? timezone
      : TZ;
  };

  const getBookDateValue = (
    item
  ) => {
    /*
     * Prefer bookteacher date.
     *
     * bookteacher date/time belongs to
     * the student's booking timezone.
     *
     * Group session fields are fallback
     * only.
     */
    return (
      item?.bookdate ||
      item?.booking_date ||
      item?.group_session_date ||
      ""
    );
  };

  const getSlotStartValue = (
    item
  ) => {
    return (
      item?.slot_start ||
      item?.booking_start_time ||
      item?.group_session_start ||
      ""
    );
  };

  const getSlotEndValue = (
    item
  ) => {
    return (
      item?.slot_end ||
      item?.booking_end_time ||
      item?.group_session_end ||
      ""
    );
  };
  const getBookingId = (
    item
  ) =>
    item?.bookingid ??
    item?.booking_id ??
    item?.id ??
    "";

  const parseBookingDateTime = (
    item,
    type = "start"
  ) => {
    const dateValue =
      getBookDateValue(item);

    const timeValue =
      type === "end"
        ? getSlotEndValue(item)
        : getSlotStartValue(item);

    if (!dateValue) {
      return null;
    }

    /*
     * Official group session date and time
     * are already stored in Asia/Dubai.
     */
    /*
  * bookteacher.slot_start / slot_end are
  * stored in the student's booking timezone.
  *
  * Convert that source timezone to Dubai.
  *
  * Only use Dubai directly when there is no
  * bookteacher date/time and we have fallen
  * back to official group session fields.
  */
    const hasBookteacherDateTime =
      Boolean(item?.bookdate) &&
      Boolean(
        type === "end"
          ? item?.slot_end
          : item?.slot_start
      );

    const isGroup =
      Number(
        item?.is_group_booking ||
        0
      ) === 1;

    const sourceTimezone =
      isGroup &&
        !hasBookteacherDateTime
        ? TZ
        : getStudentTimezone(
          item
        );
    const dateTimeValue =
      timeValue
        ? `${dateValue} ${timeValue}`
        : `${dateValue} 00:00:00`;

    const formats = [
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

    let parsed =
      moment.tz(
        dateTimeValue,
        formats,
        true,
        sourceTimezone
      );

    if (!parsed.isValid()) {
      parsed =
        moment.tz(
          dateTimeValue,
          formats,
          sourceTimezone
        );
    }

    if (!parsed.isValid()) {
      return null;
    }

    return parsed.tz(TZ);
  };

  const getDubaiBookDateMoment = (
    item
  ) => {
    const startDateTime =
      parseBookingDateTime(
        item,
        "start"
      );

    if (
      startDateTime?.isValid?.()
    ) {
      return startDateTime;
    }

    const dateValue =
      getBookDateValue(item);

    if (!dateValue) {
      return null;
    }

    const sourceTimezone =
      Number(
        item?.is_group_booking ||
        0
      ) === 1 &&
        Boolean(
          item?.group_session_date
        )
        ? TZ
        : getStudentTimezone(
          item
        );

    const formats = [
      "YYYY-MM-DD",
      "YYYY/MM/DD",
      "DD-MM-YYYY",
      "DD/MM/YYYY",
      "YYYY-MM-DD HH:mm:ss",
      "YYYY-MM-DD HH:mm",
      "YYYY/MM/DD HH:mm:ss",
      "YYYY/MM/DD HH:mm",
      moment.ISO_8601,
    ];

    let parsed =
      moment.tz(
        dateValue,
        formats,
        true,
        sourceTimezone
      );

    if (!parsed.isValid()) {
      parsed =
        moment.tz(
          dateValue,
          formats,
          sourceTimezone
        );
    }

    if (!parsed.isValid()) {
      return null;
    }

    return parsed.tz(TZ);
  };

  const formatDubaiBookingTime = (
    item,
    type = "start"
  ) => {
    const dateTime =
      parseBookingDateTime(
        item,
        type
      );

    return dateTime?.isValid?.()
      ? dateTime.format(
        "hh:mm A"
      )
      : "-";
  };

  const showAlert = (
    type,
    title,
    message
  ) => {
    setAlertData({
      open: true,
      type,
      title,
      message,
    });

    window.setTimeout(() => {
      setAlertData(
        (previous) => ({
          ...previous,
          open: false,
        })
      );
    }, 3000);
  };

  const isGroupBooking = (
    item
  ) =>
    Number(
      item?.is_group_booking ||
      0
    ) === 1;

  const getGroupRole = (
    item
  ) =>
    norm(
      item?.group_user_role
    ).replace(
      /[\s-]+/g,
      "_"
    );

  const isAssistantTeacherRow = (
    item
  ) =>
    getGroupRole(item) ===
    "assistant_teacher";

  const getGroupAssistantNames = (
    item
  ) =>
    Array.isArray(
      item?._group_assistant_teachers
    )
      ? item._group_assistant_teachers
        .map(
          (teacher) =>
            teacher?.name ||
            teacher?.teachername ||
            ""
        )
        .filter(Boolean)
      : [];

  const getMainTeacherText = (
    item
  ) =>
    item?._group_main_teacher
      ?.name ||
    item?.teachername ||
    "-";

  const getTeacherExportText = (
    item
  ) => {
    const mainTeacher =
      getMainTeacherText(item);

    const assistants =
      getGroupAssistantNames(
        item
      );

    if (
      !isGroupBooking(item) ||
      assistants.length === 0
    ) {
      return mainTeacher;
    }

    return `${mainTeacher} | Assistants: ${assistants.join(
      ", "
    )}`;
  };

  const getBookingCategory = (
    item
  ) =>
    isGroupBooking(item)
      ? "Group"
      : "One-to-One";

  const getGroupBatchText = (
    item
  ) => {
    if (!isGroupBooking(item)) {
      return "-";
    }

    if (
      item?.group_batch_label
    ) {
      return item.group_batch_label;
    }

    return item?.group_batch_id
      ? `Batch #${item.group_batch_id}`
      : "Batch N/A";
  };

  const getGroupProgrammeText = (
    item
  ) => {
    if (!isGroupBooking(item)) {
      return "-";
    }

    return (
      item?.group_programme_name ||
      "-"
    );
  };

  const getGroupSessionTitle = (
    item
  ) => {
    if (!isGroupBooking(item)) {
      return "-";
    }

    return (
      item?.group_session_title ||
      "-"
    );
  };

  const getSessionTypeKey = (
    value
  ) => {
    const type = norm(value)
      .replace(
        /[_-]+/g,
        " "
      )
      .replace(
        /\s+/g,
        " "
      )
      .trim();

    if (
      type === "in person"
    ) {
      return "in-person";
    }

    if (type === "online") {
      return "online";
    }

    return type;
  };

  const getSessionTypeDisplay = (
    value
  ) => {
    const type = norm(value)
      .replace(
        /[_-]+/g,
        " "
      )
      .replace(
        /\s+/g,
        " "
      )
      .trim();

    if (
      type === "in person"
    ) {
      return "In-Person";
    }

    if (type === "online") {
      return "Online";
    }

    return "Online";
  };

  const normalizePaymentStatus = (
    value
  ) => {
    const status =
      norm(value).replace(
        /[\s-]+/g,
        "_"
      );

    if (
      [
        "paid",
        "success",
        "successful",
        "completed",
      ].includes(status)
    ) {
      return "Paid";
    }

    if (
      [
        "free",
        "complimentary",
      ].includes(status)
    ) {
      return "Free";
    }

    if (
      [
        "pending",
        "processing",
        "initiated",
      ].includes(status)
    ) {
      return "Pending";
    }

    if (
      [
        "failed",
        "declined",
      ].includes(status)
    ) {
      return "Failed";
    }

    if (
      [
        "refunded",
        "partially_refunded",
        "partial_refund",
      ].includes(status)
    ) {
      return "Refunded";
    }

    if (
      [
        "unpaid",
        "not_paid",
        "due",
      ].includes(status)
    ) {
      return "Unpaid";
    }

    return "";
  };

  const getPaymentStatusDisplay = (
    value
  ) =>
    normalizePaymentStatus(
      value
    ) || "Unpaid";

  const getResolvedPaymentStatus = (
    item
  ) => {
    const bookingStatus =
      normalizePaymentStatus(
        item?.payment_status
      );

    const groupStatus =
      normalizePaymentStatus(
        item?.group_payment_status
      );

    if (
      [
        "Failed",
        "Refunded",
      ].includes(groupStatus)
    ) {
      return groupStatus;
    }

    if (bookingStatus) {
      return bookingStatus;
    }

    return (
      groupStatus ||
      "Unpaid"
    );
  };

  const getInpersonStatusDisplay = (
    value
  ) => {
    const status = norm(value);

    if (
      status === "upcoming"
    ) {
      return "Upcoming";
    }

    if (
      status === "ongoing"
    ) {
      return "Ongoing";
    }

    if (
      status === "completed"
    ) {
      return "Completed";
    }

    if (
      status === "cancelled"
    ) {
      return "Cancelled";
    }

    if (
      status === "missed"
    ) {
      return "Missed";
    }

    return "";
  };

  const isInPersonSession = (
    item
  ) =>
    getSessionTypeKey(
      item?.session_type
    ) === "in-person";

  const hasRecordingUrl = (
    item
  ) =>
    Boolean(
      normalizeRecordingUrl(
        item?.recording_s3_url
      )
    );

  const openRecording = (
    item
  ) => {
    const recordingUrl =
      normalizeRecordingUrl(
        item?.recording_s3_url
      );

    if (!recordingUrl) {
      return;
    }

    setActiveRecordingUrl(
      recordingUrl
    );

    setIsRecordingOpen(
      true
    );
  };

  const closeRecording = () => {
    setIsRecordingOpen(
      false
    );

    setActiveRecordingUrl(
      ""
    );
  };

  const openRescheduleModal = (
    item
  ) => {
    setSelectedBooking(item);
    setIsRescheduleOpen(true);
  };

  const closeRescheduleModal =
    () => {
      setIsRescheduleOpen(
        false
      );

      setSelectedBooking(null);
    };

  const getNow = () =>
    moment.tz(TZ);

  const getBookingStatus = (
    item
  ) => {
    const now = getNow();

    const startDateTime =
      parseBookingDateTime(
        item,
        "start"
      );

    let endDateTime =
      parseBookingDateTime(
        item,
        "end"
      );

    const hasRecording =
      hasRecordingUrl(item);

    if (isGroupBooking(item)) {
  const relatedRows =
    Array.isArray(
      item?._group_related_rows
    ) &&
      item._group_related_rows.length
      ? item._group_related_rows
      : [item];

  /*
   * One cancelled assistant row must
   * not cancel the full group session.
   */
  const allRowsCancelled =
    relatedRows.length > 0 &&
    relatedRows.every(
      (row) =>
        Number(
          row?.is_cancelled || 0
        ) === 1 ||
        norm(
          row?.group_session_status
        ) === "cancelled"
    );

  const isGroupInPerson =
    isInPersonSession(item);

  /*
   * GROUP IN-PERSON
   *
   * Same logic as One-to-One In-Person.
   * inperson_status is the primary status
   * source when available.
   */
  if (isGroupInPerson) {
    if (allRowsCancelled) {
      return "cancelled";
    }

    /*
     * Normally main booking row should
     * contain inperson_status.
     *
     * relatedRows fallback is kept in case
     * the value exists on another returned
     * group row.
     */
    const inpersonStatusRow =
      [item, ...relatedRows].find(
        (row) =>
          Boolean(
            getInpersonStatusDisplay(
              row?.inperson_status
            )
          )
      );

    const inpersonDbStatus =
      getInpersonStatusDisplay(
        inpersonStatusRow
          ?.inperson_status
      );

    if (inpersonDbStatus) {
      return norm(
        inpersonDbStatus
      );
    }

    /*
     * Fallback only when DB status
     * is not available.
     */
    if (
      !startDateTime?.isValid?.()
    ) {
      return "upcoming";
    }

    if (
      !endDateTime?.isValid?.()
    ) {
      endDateTime =
        startDateTime
          .clone()
          .add(
            1,
            "hour"
          );
    }

    if (
      now.isBefore(
        startDateTime
      )
    ) {
      return "upcoming";
    }

    if (
      now.isSameOrAfter(
        startDateTime
      ) &&
      now.isSameOrBefore(
        endDateTime
      )
    ) {
      return "ongoing";
    }

    /*
     * Same fallback behaviour as
     * One-to-One In-Person.
     */
    return "completed";
  }

  /*
   * GROUP ONLINE
   *
   * Keep existing behaviour unchanged.
   * Recording confirms completion.
   */
  if (hasRecording) {
    return "completed";
  }

  if (
    !startDateTime?.isValid?.()
  ) {
    return allRowsCancelled
      ? "cancelled"
      : "upcoming";
  }

  if (
    !endDateTime?.isValid?.()
  ) {
    endDateTime =
      startDateTime
        .clone()
        .add(
          1,
          "hour"
        );
  }

  if (
    now.isBefore(
      startDateTime
    )
  ) {
    return allRowsCancelled
      ? "cancelled"
      : "upcoming";
  }

  if (
    now.isSameOrAfter(
      startDateTime
    ) &&
    now.isSameOrBefore(
      endDateTime
    )
  ) {
    return allRowsCancelled
      ? "cancelled"
      : "ongoing";
  }

  /*
   * Online group session:
   * recording = Completed
   * no recording = Missed
   */
  return "missed";
}

    if (
      Number(
        item?.is_cancelled ||
        0
      ) === 1
    ) {
      return "cancelled";
    }

    const inpersonDbStatus =
      getInpersonStatusDisplay(
        item?.inperson_status
      );

    if (
      isInPersonSession(item) &&
      inpersonDbStatus
    ) {
      return norm(
        inpersonDbStatus
      );
    }

    const bookingDate =
      getBookDateValue(item);

    const inPerson =
      isInPersonSession(item);

    if (!bookingDate) {
      return "upcoming";
    }

    if (
      endDateTime?.isValid?.()
    ) {
      if (
        now.isAfter(
          endDateTime
        )
      ) {
        if (inPerson) {
          return "completed";
        }

        const teacherFeedbackDone =
          Number(
            item
              ?.has_teacher_feedback ||
            0
          ) === 1;

        return hasRecording ||
          teacherFeedbackDone
          ? "completed"
          : "missed";
      }

      if (
        startDateTime
          ?.isValid?.() &&
        now.isSameOrAfter(
          startDateTime
        ) &&
        now.isSameOrBefore(
          endDateTime
        )
      ) {
        return "ongoing";
      }

      return "upcoming";
    }

    const dayEnd =
      parseBookingDateTime(
        {
          ...item,
          slot_end:
            "23:59:59",
        },
        "end"
      );

    if (
      dayEnd &&
      now.isAfter(dayEnd)
    ) {
      if (inPerson) {
        return "completed";
      }

      const teacherFeedbackDone =
        Number(
          item
            ?.has_teacher_feedback ||
          0
        ) === 1;

      return hasRecording ||
        teacherFeedbackDone
        ? "completed"
        : "missed";
    }

    return "upcoming";
  };

  const isRescheduleDisabled = (
    item
  ) => {
    if (isGroupBooking(item)) {
      return true;
    }

    const status =
      getBookingStatus(item);

    if (
      [
        "missed",
        "completed",
        "cancelled",
      ].includes(
        norm(status)
      )
    ) {
      return true;
    }

    const dateValue =
      getBookDateValue(item);

    const startValue =
      getSlotStartValue(item);

    if (!dateValue) {
      return false;
    }

    const now = getNow();

    const startDateTime =
      startValue
        ? parseBookingDateTime(
          item,
          "start"
        )
        : null;

    if (startDateTime) {
      return now.isSameOrAfter(
        startDateTime
      );
    }

    const bookingDate =
      getDubaiBookDateMoment(
        item
      );

    if (!bookingDate) {
      return false;
    }

    return bookingDate.isBefore(
      now,
      "day"
    );
  };

  const isDeleteDisabled = (
    item
  ) => {
    if (isGroupBooking(item)) {
      return true;
    }

    const status = norm(
      getBookingStatus(item)
    );

    if (
      status === "missed"
    ) {
      return false;
    }

    if (
      status === "completed"
    ) {
      return true;
    }

    const bookingDate =
      getDubaiBookDateMoment(
        item
      );

    if (
      !bookingDate?.isValid?.()
    ) {
      return true;
    }

    const todayDubai =
      moment
        .tz(TZ)
        .startOf("day");

    const bookingDayDubai =
      bookingDate
        .clone()
        .startOf("day");

    return bookingDayDubai.isBefore(
      todayDubai,
      "day"
    );
  };

  const getBookingStatusBadgeClass = (
    status
  ) => {
    const value = norm(status);

    if (
      value === "completed"
    ) {
      return "bg-success";
    }

    if (
      value === "ongoing"
    ) {
      return "bg-info";
    }

    if (
      value === "missed" ||
      value === "cancelled"
    ) {
      return "bg-danger";
    }

    return "bg-warning text-dark";
  };

  const getPaymentTypeBadgeClass = (
    type
  ) => {
    const value = norm(type);

    if (value === "direct") {
      return "bg-success";
    }

    if (value === "block") {
      return "bg-primary";
    }

    if (
      value === "subscription"
    ) {
      return "bg-warning text-dark";
    }

    return "bg-secondary";
  };

  const getBookingTypeDisplay = (
    type
  ) => {
    const value = norm(type);

    if (value === "manual") {
      return "Manual";
    }

    if (
      value === "web app"
    ) {
      return "Web App";
    }

    if (value === "portal") {
      return "Portal";
    }

    return String(type || "-")
      .replace(
        /[_-]+/g,
        " "
      )
      .replace(
        /\s+/g,
        " "
      )
      .trim()
      .replace(
        /\b\w/g,
        (character) =>
          character.toUpperCase()
      );
  };

  const getBookingTypeBadgeClass = (
    type
  ) => {
    const value = norm(type);

    if (value === "manual") {
      return "bg-primary";
    }

    if (
      value === "web app"
    ) {
      return "bg-success";
    }

    return "bg-secondary";
  };

  const getAmountValue = (
    item
  ) => {
    const rawAmount =
      item?.booking_amount ??
      item?.amount ??
      0;

    const amount = Number(
      String(
        rawAmount ?? "0"
      )
        .replace(/,/g, "")
        .trim()
    );

    return Number.isFinite(
      amount
    )
      ? amount
      : 0;
  };

  const getAmountText = (
    item
  ) =>
    `AED ${getAmountValue(
      item
    ).toFixed(2)}`;

  const isDirectBooking = (
    item
  ) =>
    norm(
      item?.payment_type
    ) === "direct";

  const makeRowKey = (
    item
  ) => {
    /*
     * For group bookings, assistant rows
     * must merge into the same student
     * booking instead of appearing separately.
     */
    if (isGroupBooking(item)) {
      return [
        "group",
        item
          ?.group_programme_id ||
        "na",
        item?.group_batch_id ||
        "na",
        item
          ?.group_live_session_id ||
        "na",
        item?.studentid ||
        item?.studentname ||
        "na",
      ].join("|");
    }

    const bookingId =
      item?.bookingid ??
      item?.booking_id ??
      item?.id ??
      "na";

    const dateValue =
      getBookDateValue(item) ||
      "na";

    const startValue =
      getSlotStartValue(item) ||
      "na";

    const endValue =
      getSlotEndValue(item) ||
      "na";

    const teacherName =
      item?.teachername ??
      "na";

    const studentName =
      item?.studentname ??
      "na";

    const studentId =
      item?.studentid ??
      "na";

    return [
      bookingId,
      dateValue,
      startValue,
      endValue,
      teacherName,
      studentName,
      studentId,
    ].join("|");
  };

  const consolidateBookings = (
    list
  ) => {
    const oneToOneMap =
      new Map();

    const groupMap =
      new Map();

    (list || []).forEach(
      (item) => {
        const key =
          makeRowKey(item);

        if (
          !isGroupBooking(item)
        ) {
          if (
            !oneToOneMap.has(
              key
            )
          ) {
            oneToOneMap.set(
              key,
              item
            );
          }

          return;
        }

        if (!groupMap.has(key)) {
          groupMap.set(key, {
            rows: [],
            mainRow: null,
          });
        }

        const group =
          groupMap.get(key);

        group.rows.push(item);

        if (
          !isAssistantTeacherRow(
            item
          ) &&
          !group.mainRow
        ) {
          group.mainRow = item;
        }
      }
    );

    const consolidatedGroupRows =
      Array.from(
        groupMap.values()
      ).map((group) => {
        const baseRow =
          group.mainRow ||
          group.rows[0] ||
          {};

        const assistantMap =
          new Map();

        group.rows
          .filter(
            isAssistantTeacherRow
          )
          .forEach((row) => {
            const teacherKey =
              String(
                row?.teacherid ||
                row?.teachername ||
                ""
              ).trim();

            if (
              teacherKey &&
              !assistantMap.has(
                teacherKey
              )
            ) {
              assistantMap.set(
                teacherKey,
                {
                  id:
                    row?.teacherid ||
                    "",
                  name:
                    row?.teachername ||
                    "Assistant Teacher",
                }
              );
            }
          });

        const recordingRow =
          group.rows.find(
            (row) =>
              Boolean(
                normalizeRecordingUrl(
                  row
                    ?.recording_s3_url
                )
              )
          );

        return {
          ...baseRow,

          recording_s3_url:
            recordingRow
              ?.recording_s3_url ||
            baseRow
              ?.recording_s3_url ||
            null,

          _group_related_rows:
            group.rows,

          _group_main_teacher: {
            id:
              group.mainRow
                ?.teacherid ||
              "",

            name:
              group.mainRow
                ?.teachername ||
              baseRow?.teachername ||
              "Main Teacher N/A",
          },

          _group_assistant_teachers:
            Array.from(
              assistantMap.values()
            ),
        };
      });

    return [
      ...oneToOneMap.values(),
      ...consolidatedGroupRows,
    ];
  };

  const sortBookings = (
    first,
    second
  ) => {
    /*
     * Sorting is based on session end
     * date/time in descending order.
     *
     * Example:
     * 29 July first
     * 25 July afterwards
     */
    const firstMoment =
      parseBookingDateTime(
        first,
        "end"
      ) ||
      getDubaiBookDateMoment(
        first
      );

    const secondMoment =
      parseBookingDateTime(
        second,
        "end"
      ) ||
      getDubaiBookDateMoment(
        second
      );

    const firstTime =
      firstMoment?.isValid?.()
        ? firstMoment.valueOf()
        : 0;

    const secondTime =
      secondMoment?.isValid?.()
        ? secondMoment.valueOf()
        : 0;

    if (
      firstTime !== secondTime
    ) {
      return (
        secondTime -
        firstTime
      );
    }

    return (
      Number(
        getBookingId(second) ||
        0
      ) -
      Number(
        getBookingId(first) ||
        0
      )
    );
  };

  const getTokenValue =
    async () => {
      const tokenResponse =
        await getToken();

      if (
        typeof tokenResponse ===
        "string"
      ) {
        return tokenResponse;
      }

      if (
        typeof tokenResponse
          ?.token === "string"
      ) {
        return tokenResponse.token;
      }

      if (
        typeof tokenResponse
          ?.Token === "string"
      ) {
        return tokenResponse.Token;
      }

      if (
        typeof tokenResponse
          ?.data?.token ===
        "string"
      ) {
        return tokenResponse
          .data.token;
      }

      if (
        typeof tokenResponse
          ?.data?.Token ===
        "string"
      ) {
        return tokenResponse
          .data.Token;
      }

      if (
        typeof tokenResponse
          ?.data?.data
          ?.token === "string"
      ) {
        return tokenResponse
          .data.data.token;
      }

      if (
        typeof tokenResponse
          ?.data?.data
          ?.Token === "string"
      ) {
        return tokenResponse
          .data.data.Token;
      }

      return "";
    };

  const findPortalAdminSession = (
    value,
    depth = 0
  ) => {
    if (
      depth > 6 ||
      value === null ||
      value === undefined
    ) {
      return null;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        const found =
          findPortalAdminSession(
            item,
            depth + 1
          );

        if (found) {
          return found;
        }
      }

      return null;
    }

    if (
      typeof value !== "object"
    ) {
      return null;
    }

    const possibleAdminId =
      value?.admin_user_id ??
      value?.user_id ??
      value?.userid ??
      value?.userId ??
      value?.id ??
      "";

    const possibleSessionVersion =
      value?.session_version ??
      value?.sessionVersion ??
      "";

    const possibleRoleId =
      value?.roleid ??
      value?.role_id ??
      "";

    const hasValidId =
      String(
        possibleAdminId
      ).trim() !== "";

    const hasValidSession =
      String(
        possibleSessionVersion
      ).trim() !== "";

    const isPortalAdmin =
      String(
        possibleRoleId
      ).trim() === "" ||
      Number(
        possibleRoleId
      ) === 6;

    if (
      hasValidId &&
      hasValidSession &&
      isPortalAdmin
    ) {
      return {
        adminUserId:
          Number(
            possibleAdminId
          ),

        sessionVersion:
          String(
            possibleSessionVersion
          ),
      };
    }

    for (
      const nestedValue of
      Object.values(value)
    ) {
      const found =
        findPortalAdminSession(
          nestedValue,
          depth + 1
        );

      if (found) {
        return found;
      }
    }

    return null;
  };

  const readAdminCredentialsFromStorage = (
    storage
  ) => {
    if (!storage) {
      return null;
    }

    const directAdminId =
      storage.getItem(
        "admin_user_id"
      ) ||
      storage.getItem(
        "user_id"
      ) ||
      storage.getItem(
        "userid"
      ) ||
      storage.getItem(
        "userId"
      ) ||
      "";

    const directSessionVersion =
      storage.getItem(
        "session_version"
      ) ||
      storage.getItem(
        "sessionVersion"
      ) ||
      "";

    if (
      String(
        directAdminId
      ).trim() !== "" &&
      String(
        directSessionVersion
      ).trim() !== ""
    ) {
      return {
        adminUserId:
          Number(
            directAdminId
          ),

        sessionVersion:
          String(
            directSessionVersion
          ),
      };
    }

    for (
      let index = 0;
      index < storage.length;
      index += 1
    ) {
      const key =
        storage.key(index);

      if (!key) {
        continue;
      }

      const storedValue =
        storage.getItem(key);

      if (!storedValue) {
        continue;
      }

      try {
        const parsedValue =
          JSON.parse(
            storedValue
          );

        const found =
          findPortalAdminSession(
            parsedValue
          );

        if (found) {
          return found;
        }
      } catch (error) {
        // Plain values are ignored.
      }
    }

    return null;
  };

  const getPortalAdminCredentials =
    () => {
      const localCredentials =
        readAdminCredentialsFromStorage(
          window.localStorage
        );

      if (localCredentials) {
        return localCredentials;
      }

      const sessionCredentials =
        readAdminCredentialsFromStorage(
          window.sessionStorage
        );

      if (
        sessionCredentials
      ) {
        return sessionCredentials;
      }

      return {
        adminUserId: 0,
        sessionVersion: "",
      };
    };

  const openDeleteModal = (
    item
  ) => {
    if (isGroupBooking(item)) {
      showAlert(
        "error",
        "Delete Not Allowed",
        "Group bookings cannot be deleted from this action."
      );

      return;
    }

    const bookingId =
      getBookingId(item);

    if (!bookingId) {
      showAlert(
        "error",
        "Delete Failed",
        "Booking ID was not found."
      );

      return;
    }

    setDeleteModal({
      open: true,
      item,
    });
  };

  const closeDeleteModal =
    () => {
      if (
        deletingBookingId
      ) {
        return;
      }

      setDeleteModal({
        open: false,
        item: null,
      });
    };

  const handleHardDeleteBooking =
    async () => {
      const item =
        deleteModal.item;

      const bookingId =
        getBookingId(item);

      if (
        !item ||
        !bookingId ||
        deletingBookingId
      ) {
        return;
      }

      setDeletingBookingId(
        String(bookingId)
      );

      try {
        const token =
          await getTokenValue();

        if (!token) {
          throw new Error(
            "API token was not found. Please refresh the page and try again."
          );
        }

        const {
          adminUserId,
          sessionVersion,
        } =
          getPortalAdminCredentials();

        if (
          !adminUserId ||
          !sessionVersion
        ) {
          throw new Error(
            "Admin session details were not found. Please log out and log in again."
          );
        }

        const numericBookingId =
          Number(bookingId);

        if (
          !Number.isInteger(
            numericBookingId
          ) ||
          numericBookingId <= 0
        ) {
          throw new Error(
            "A valid booking ID is required."
          );
        }

        const payload = {
          bookingid:
            numericBookingId,

          admin_user_id:
            Number(
              adminUserId
            ),

          session_version:
            String(
              sessionVersion
            ),

          token,
        };

        const response =
          await axios.post(
            HARD_DELETE_BOOKING_URL,
            payload,
            {
              headers:
                API_HEADERS,
            }
          );

        if (
          Number(
            response?.data
              ?.statusCode
          ) !== 200
        ) {
          throw new Error(
            response?.data
              ?.message ||
            "Booking could not be permanently deleted. No changes were saved."
          );
        }

        setRows(
          (previousRows) =>
            previousRows.filter(
              (row) =>
                String(
                  getBookingId(
                    row
                  )
                ) !==
                String(
                  bookingId
                )
            )
        );

        setAmountDraftMap(
          (previous) => {
            const next = {
              ...previous,
            };

            delete next[
              bookingId
            ];

            return next;
          }
        );

        setDeleteModal({
          open: false,
          item: null,
        });

        showAlert(
          "success",
          "Booking Deleted",
          response?.data
            ?.message ||
          "Booking permanently deleted successfully."
        );
      } catch (error) {
        const message =
          error?.response?.data
            ?.message ||
          error?.message ||
          "Booking could not be deleted. No database changes were saved.";

        showAlert(
          "error",
          "Delete Failed",
          message
        );
      } finally {
        setDeletingBookingId(
          ""
        );
      }
    };

  const setFieldSaving = (
    bookingId,
    field,
    isSaving
  ) => {
    const key =
      `${bookingId}_${field}`;

    setSavingMap(
      (previous) => ({
        ...previous,
        [key]: isSaving,
      })
    );
  };

  const isFieldSaving = (
    bookingId,
    field
  ) => {
    const key =
      `${bookingId}_${field}`;

    return Boolean(
      savingMap[key]
    );
  };

  const patchRow = (
    bookingId,
    patch
  ) => {
    setRows(
      (previous) =>
        previous.map(
          (row) =>
            String(
              getBookingId(
                row
              )
            ) ===
              String(
                bookingId
              )
              ? {
                ...row,
                ...patch,
              }
              : row
        )
    );
  };

  const updateDynamicBookingData =
    async (
      item,
      updates = {}
    ) => {
      const bookingId =
        getBookingId(item);

      if (!bookingId) {
        throw new Error(
          "Booking ID was not found."
        );
      }

      const token =
        await getTokenValue();

      if (!token) {
        throw new Error(
          "API token was not found."
        );
      }

      const conditionId =
        /^\d+$/.test(
          String(bookingId)
        )
          ? Number(bookingId)
          : bookingId;

      const updateData = {};

      if (
        Object.prototype.hasOwnProperty.call(
          updates,
          "payment_status"
        )
      ) {
        updateData.payment_status =
          updates.payment_status;
      }

      if (
        Object.prototype.hasOwnProperty.call(
          updates,
          "sessionType"
        )
      ) {
        updateData.sessionType =
          updates.sessionType;
      }

      if (
        Object.prototype.hasOwnProperty.call(
          updates,
          "amount"
        )
      ) {
        updateData.amount =
          updates.amount;
      }

      if (
        Object.keys(
          updateData
        ).length === 0
      ) {
        throw new Error(
          "Update data was not found."
        );
      }

      const payload = {
        token,

        tablename:
          "bookteacher",

        conditions: [
          {
            id: conditionId,
          },
        ],

        updatedata: [
          updateData,
        ],
      };

      const response =
        await axios.post(
          UPDATE_DYNAMIC_DATA_URL,
          payload,
          {
            headers:
              API_HEADERS,
          }
        );

      if (
        Number(
          response?.data
            ?.statusCode
        ) !== 200
      ) {
        throw new Error(
          response?.data
            ?.message ||
          "Update failed."
        );
      }

      return response.data;
    };

  const openConfirmModal = (
    item,
    field,
    newValue
  ) => {
    if (
      field ===
      "payment_status"
    ) {
      const currentValue =
        getPaymentStatusDisplay(
          item?.payment_status
        );

      if (
        currentValue ===
        newValue
      ) {
        return;
      }

      setConfirmModal({
        open: true,
        item,
        field,
        newValue,

        title:
          "Update Payment Status",

        message:
          `Are you sure you want to change payment status from "${currentValue}" to "${newValue}"?`,
      });

      return;
    }

    if (
      field ===
      "session_type"
    ) {
      const currentValue =
        getSessionTypeDisplay(
          item?.session_type
        );

      if (
        currentValue ===
        newValue
      ) {
        return;
      }

      setConfirmModal({
        open: true,
        item,
        field,
        newValue,

        title:
          "Update Session Type",

        message:
          `Are you sure you want to change session type from "${currentValue}" to "${newValue}"?`,
      });

      return;
    }

    if (field === "amount") {
      const currentValue =
        getAmountValue(item);

      const nextValue =
        Number(
          String(
            newValue ?? "0"
          )
            .replace(/,/g, "")
            .trim()
        );

      if (
        !Number.isFinite(
          nextValue
        ) ||
        nextValue < 0
      ) {
        showAlert(
          "error",
          "Invalid Amount",
          "Please enter a valid amount."
        );

        return;
      }

      if (
        currentValue ===
        nextValue
      ) {
        return;
      }

      setConfirmModal({
        open: true,
        item,
        field,
        newValue:
          nextValue,

        title:
          "Update Amount",

        message:
          `Are you sure you want to change amount from "AED ${currentValue.toFixed(
            2
          )}" to "AED ${nextValue.toFixed(
            2
          )}"?`,
      });
    }
  };

  const closeConfirmModal =
    () => {
      if (confirmLoading) {
        return;
      }

      setConfirmModal({
        open: false,
        item: null,
        field: "",
        newValue: "",
        title: "",
        message: "",
      });
    };

  const handleConfirmUpdate =
    async () => {
      const {
        item,
        field,
        newValue,
      } = confirmModal;

      if (
        !item ||
        !field ||
        newValue === "" ||
        newValue === null ||
        newValue === undefined
      ) {
        return;
      }

      const bookingId =
        getBookingId(item);

      if (!bookingId) {
        showAlert(
          "error",
          "Update Failed",
          "Booking ID was not found."
        );

        closeConfirmModal();
        return;
      }

      setConfirmLoading(true);

      setFieldSaving(
        bookingId,
        field,
        true
      );

      const previousValue =
        field ===
          "payment_status"
          ? getPaymentStatusDisplay(
            item?.payment_status
          )
          : field ===
            "session_type"
            ? getSessionTypeDisplay(
              item?.session_type
            )
            : getAmountValue(
              item
            );

      const optimisticPatch =
        field ===
          "payment_status"
          ? {
            payment_status:
              newValue,
          }
          : field ===
            "session_type"
            ? {
              session_type:
                newValue,
            }
            : {
              booking_amount:
                newValue,
            };

      patchRow(
        bookingId,
        optimisticPatch
      );

      try {
        await updateDynamicBookingData(
          {
            ...item,
            ...optimisticPatch,
          },

          field ===
            "payment_status"
            ? {
              payment_status:
                newValue,
            }
            : field ===
              "session_type"
              ? {
                sessionType:
                  newValue,
              }
              : {
                amount:
                  newValue,
              }
        );

        if (
          field === "amount"
        ) {
          setAmountDraftMap(
            (previous) => ({
              ...previous,

              [bookingId]:
                newValue,
            })
          );
        }

        showAlert(
          "success",
          "Updated Successfully",
          `${confirmModal.title} completed successfully.`
        );

        closeConfirmModal();
      } catch (error) {
        patchRow(
          bookingId,

          field ===
            "payment_status"
            ? {
              payment_status:
                previousValue,
            }
            : field ===
              "session_type"
              ? {
                session_type:
                  previousValue,
              }
              : {
                booking_amount:
                  previousValue,
              }
        );

        if (
          field === "amount"
        ) {
          setAmountDraftMap(
            (previous) => ({
              ...previous,

              [bookingId]:
                previousValue,
            })
          );
        }

        showAlert(
          "error",
          "Update Failed",
          error?.message ||
          "Something went wrong."
        );
      } finally {
        setConfirmLoading(
          false
        );

        setFieldSaving(
          bookingId,
          field,
          false
        );
      }
    };

  const fetchBookings =
    useCallback(async () => {
      setInitialLoading(true);
      setLoadError("");

      try {
        const response =
          await getAllBookings();

        const rawRows =
          Array.isArray(
            response
          )
            ? response
            : Array.isArray(
              response?.data
            )
              ? response.data
              : Array.isArray(
                response
                  ?.getall_bookings
              )
                ? response
                  .getall_bookings
                : Array.isArray(
                  response
                    ?.getallbookings
                )
                  ? response
                    .getallbookings
                  : [];

        const consolidatedRows =
          consolidateBookings(
            rawRows
          );

        const sortedRows =
          consolidatedRows
            .slice()
            .sort(sortBookings);

        setRows(sortedRows);
      } catch (error) {
        console.error(
          "getAllBookings failed:",
          error
        );

        setRows([]);

        setLoadError(
          "Bookings are not loading. Please check the network."
        );
      } finally {
        setInitialLoading(
          false
        );
      }
    }, []);

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  useEffect(() => {
    setCurrentPage(1);
  }, [
    searchTerm,
    paymentTypeFilter,
    bookingStatusFilter,
    paymentStatusFilter,
    sessionTypeFilter,
    bookingTypeFilter,
    groupFilter,
    groupBatchFilter,
    startDate,
    endDate,
  ]);

  const paymentOptions =
    useMemo(() => {
      const options =
        new Set();

      (rows || []).forEach(
        (row) => {
          const paymentType =
            norm(
              row?.payment_type
            );

          if (paymentType) {
            options.add(
              paymentType
            );
          }
        }
      );

      return Array.from(
        options
      );
    }, [rows]);

  const sessionTypeOptions =
    useMemo(() => {
      const options =
        new Set();

      (rows || []).forEach(
        (row) => {
          const sessionType =
            getSessionTypeKey(
              row?.session_type
            );

          if (sessionType) {
            options.add(
              sessionType
            );
          }
        }
      );

      return Array.from(
        options
      );
    }, [rows]);

  const bookingTypeOptions =
    useMemo(() => {
      const options =
        new Set();

      (rows || []).forEach(
        (row) => {
          const bookingType =
            norm(
              row?.booking_type
            );

          if (bookingType) {
            options.add(
              bookingType
            );
          }
        }
      );

      return Array.from(
        options
      );
    }, [rows]);

  const groupBatchOptions =
    useMemo(() => {
      const optionsMap =
        new Map();

      (rows || []).forEach(
        (row) => {
          if (
            !isGroupBooking(row)
          ) {
            return;
          }

          const batchId =
            row?.group_batch_id;

          if (!batchId) {
            return;
          }

          optionsMap.set(
            String(batchId),
            getGroupBatchText(
              row
            )
          );
        }
      );

      return Array.from(
        optionsMap.entries()
      ).map(
        ([
          value,
          label,
        ]) => ({
          value,
          label,
        })
      );
    }, [rows]);

  const filteredData =
    useMemo(() => {
      const normalizedSearch =
        norm(searchTerm);

      const normalizedPaymentType =
        norm(
          paymentTypeFilter
        );

      const normalizedBookingStatus =
        norm(
          bookingStatusFilter
        );

      const normalizedPaymentStatus =
        norm(
          paymentStatusFilter
        );

      const normalizedSessionType =
        getSessionTypeKey(
          sessionTypeFilter
        );

      const normalizedBookingType =
        norm(
          bookingTypeFilter
        );

      const normalizedGroup =
        norm(groupFilter);

      const normalizedBatch =
        norm(
          groupBatchFilter
        );

      const startMoment =
        startDate
          ? moment.tz(
            startDate,
            "YYYY-MM-DD",
            true,
            TZ
          )
          : null;

      const endMoment =
        endDate
          ? moment.tz(
            endDate,
            "YYYY-MM-DD",
            true,
            TZ
          )
          : null;

      return (
        rows || []
      ).filter((item) => {
        const bookingStatus =
          getBookingStatus(
            item
          );

        const fullText = [
          item?.studentname ||
          "",

          item?.teachername ||
          "",

          ...getGroupAssistantNames(
            item
          ),

          item?.payment_type ||
          "",

          getResolvedPaymentStatus(
            item
          ),

          getSessionTypeDisplay(
            item?.session_type
          ),

          item?.booking_type ||
          "",

          getBookingCategory(
            item
          ),

          getGroupProgrammeText(
            item
          ),

          getGroupBatchText(
            item
          ),

          getGroupSessionTitle(
            item
          ),

          item?.group_batch_id ||
          "",

          item
            ?.group_programme_id ||
          "",

          item
            ?.group_live_session_id ||
          "",

          getAmountText(item),

          bookingStatus,

          getBookDateValue(
            item
          ),

          getSlotStartValue(
            item
          ),

          getSlotEndValue(
            item
          ),
        ]
          .join(" ")
          .toLowerCase();

        const matchesSearch =
          !normalizedSearch ||
          fullText.includes(
            normalizedSearch
          );

        const matchesPaymentType =
          !normalizedPaymentType ||
          norm(
            item?.payment_type
          ) ===
          normalizedPaymentType;

        const matchesBookingStatus =
          !normalizedBookingStatus ||
          norm(
            bookingStatus
          ) ===
          normalizedBookingStatus;

        const matchesPaymentStatus =
          !normalizedPaymentStatus ||
          norm(
            getResolvedPaymentStatus(
              item
            )
          ) ===
          normalizedPaymentStatus;

        const matchesSessionType =
          !normalizedSessionType ||
          getSessionTypeKey(
            item?.session_type
          ) ===
          normalizedSessionType;

        const matchesBookingType =
          !normalizedBookingType ||
          norm(
            item?.booking_type
          ) ===
          normalizedBookingType;

        const matchesGroupType =
          !normalizedGroup ||
          (
            normalizedGroup ===
            "group" &&
            isGroupBooking(item)
          ) ||
          (
            normalizedGroup ===
            "one-to-one" &&
            !isGroupBooking(
              item
            )
          );

        const matchesBatch =
          !normalizedBatch ||
          String(
            item?.group_batch_id ||
            ""
          ) ===
          String(
            normalizedBatch
          );

        const itemDate =
          getDubaiBookDateMoment(
            item
          );

        const matchesStartDate =
          startMoment
            ? itemDate
              ? itemDate.isSameOrAfter(
                startMoment,
                "day"
              )
              : false
            : true;

        const matchesEndDate =
          endMoment
            ? itemDate
              ? itemDate.isSameOrBefore(
                endMoment,
                "day"
              )
              : false
            : true;

        return (
          matchesSearch &&
          matchesPaymentType &&
          matchesBookingStatus &&
          matchesPaymentStatus &&
          matchesSessionType &&
          matchesBookingType &&
          matchesGroupType &&
          matchesBatch &&
          matchesStartDate &&
          matchesEndDate
        );
      });
    }, [
      rows,
      searchTerm,
      paymentTypeFilter,
      bookingStatusFilter,
      paymentStatusFilter,
      sessionTypeFilter,
      bookingTypeFilter,
      groupFilter,
      groupBatchFilter,
      startDate,
      endDate,
    ]);

  const totalPages =
    Math.ceil(
      filteredData.length /
      itemsPerPage
    ) || 1;

  const safePage = Math.min(
    Math.max(
      currentPage,
      1
    ),
    totalPages
  );

  const indexOfLastItem =
    safePage *
    itemsPerPage;

  const indexOfFirstItem =
    indexOfLastItem -
    itemsPerPage;

  const currentItems =
    filteredData.slice(
      indexOfFirstItem,
      indexOfLastItem
    );

  useEffect(() => {
    if (
      currentPage !==
      safePage
    ) {
      setCurrentPage(
        safePage
      );
    }
  }, [
    safePage,
    currentPage,
  ]);

  const exportToExcel = () => {
    const heading = [
      ["Booking List"],
    ];

    const exportData =
      filteredData.map(
        (item, index) => {
          const status =
            getBookingStatus(
              item
            );

          const bookingDate =
            getDubaiBookDateMoment(
              item
            );

          return {
            "S.L": index + 1,

            "Book Date":
              bookingDate
                ? bookingDate.format(
                  "DD MMM YYYY"
                )
                : "-",

            "Student Name":
              item?.studentname ||
              "-",

            "Booked Teacher":
              getTeacherExportText(
                item
              ),

            "Slot Start":
              formatDubaiBookingTime(
                item,
                "start"
              ),

            "Slot End":
              formatDubaiBookingTime(
                item,
                "end"
              ),

            Amount:
              getAmountText(
                item
              ),

            "Payment Type":
              item?.payment_type ||
              "-",

            "Payment Status":
              getResolvedPaymentStatus(
                item
              ) || "-",

            "Session Type":
              getSessionTypeDisplay(
                item?.session_type
              ) || "-",

            "Booking Type":
              getBookingTypeDisplay(
                item?.booking_type
              ),

            "Class Type":
              getBookingCategory(
                item
              ),

            Programme:
              getGroupProgrammeText(
                item
              ),

            Batch:
              getGroupBatchText(
                item
              ),

            "Group Session":
              getGroupSessionTitle(
                item
              ),

            Status:
              status
                ? status
                  .charAt(0)
                  .toUpperCase() +
                status.slice(1)
                : "-",
          };
        }
      );

    const worksheet =
      XLSX.utils.json_to_sheet(
        exportData,
        {
          origin: -1,
        }
      );

    XLSX.utils.sheet_add_aoa(
      worksheet,
      heading,
      {
        origin: "A1",
      }
    );

    const workbook =
      XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      "Bookings"
    );

    XLSX.writeFile(
      workbook,
      "bookings.xlsx"
    );
  };

  const exportToPDF = () => {
    const document =
      new jsPDF();

    document.setFontSize(16);

    document.text(
      "Booking List",
      14,
      20
    );

    const columns = [
      "S.L",
      "Book Date",
      "Student Name",
      "Booked Teacher",
      "Slot Start",
      "Slot End",
      "Amount",
      "Payment Type",
      "Payment Status",
      "Session Type",
      "Booking Type",
      "Class Type",
      "Programme",
      "Batch",
      "Group Session",
      "Status",
    ];

    const pdfRows =
      filteredData.map(
        (item, index) => {
          const status =
            getBookingStatus(
              item
            );

          const bookingDate =
            getDubaiBookDateMoment(
              item
            );

          return [
            index + 1,

            bookingDate
              ? bookingDate.format(
                "DD MMM YYYY"
              )
              : "-",

            item?.studentname ||
            "-",

            getTeacherExportText(
              item
            ),

            formatDubaiBookingTime(
              item,
              "start"
            ),

            formatDubaiBookingTime(
              item,
              "end"
            ),

            getAmountText(item),

            item?.payment_type ||
            "-",

            getResolvedPaymentStatus(
              item
            ) || "-",

            getSessionTypeDisplay(
              item?.session_type
            ) || "-",

            getBookingTypeDisplay(
              item?.booking_type
            ),

            getBookingCategory(
              item
            ),

            getGroupProgrammeText(
              item
            ),

            getGroupBatchText(
              item
            ),

            getGroupSessionTitle(
              item
            ),

            status
              ? status
                .charAt(0)
                .toUpperCase() +
              status.slice(1)
              : "-",
          ];
        }
      );

    autoTable(document, {
      startY: 25,
      head: [columns],
      body: pdfRows,

      styles: {
        fontSize: 8,
      },

      headStyles: {
        fontSize: 8,
      },
    });

    document.save(
      "bookings.pdf"
    );
  };

  if (initialLoading) {
    return (
      <div
        className="d-flex justify-content-center align-items-center"
        style={{
          height: "300px",
        }}
      >
        <div
          style={{
            width: "48px",
            height: "48px",

            border:
              "6px solid #e0e0e0",

            borderTop:
              "6px solid #45B369",

            borderRadius:
              "50%",

            animation:
              "spin 1s linear infinite",
          }}
        />

        <style>
          {`
            @keyframes spin {
              0% {
                transform: rotate(0);
              }

              100% {
                transform: rotate(360deg);
              }
            }
          `}
        </style>
      </div>
    );
  }

  return (
    <div className="card h-100 p-0 radius-12">
      <style>
        {`
          .lyl-select-wrap {
            position: relative;
            min-width: 170px;
          }

          .lyl-select {
            width: 100%;
            height: 46px;
            appearance: none;
            -webkit-appearance: none;
            -moz-appearance: none;
            border: 1px solid #2d7ff9;
            border-radius: 16px;
            padding: 0 42px 0 16px;
            background: #22324a;
            color: #ffffff;
            font-size: 15px;
            font-weight: 700;
            outline: none;
            box-shadow: none;
            transition: all 0.2s ease;
          }

          .lyl-select:hover {
            border-color: #2f83ff;
            box-shadow:
              inset 0 0 0 1px rgba(255, 255, 255, 0.03),
              0 10px 22px rgba(0, 0, 0, 0.2);
          }

          .lyl-select-wrap::after {
            content: "";
            position: absolute;
            right: 16px;
            top: 50%;
            width: 10px;
            height: 10px;
            border-right: 2px solid rgba(255, 255, 255, 0.9);
            border-bottom: 2px solid rgba(255, 255, 255, 0.9);
            transform: translateY(-65%) rotate(45deg);
            pointer-events: none;
          }

          .lyl-select:disabled {
            opacity: 0.6;
            cursor: not-allowed;
          }

          .lyl-cell-note {
            margin-top: 7px;
            font-size: 11px;
            color: #8aa0bf;
            font-weight: 600;
          }

          .lyl-modal-overlay {
            position: fixed;
            inset: 0;
            z-index: 1200;
            background: rgba(1, 9, 20, 0.72);
            backdrop-filter: blur(6px);
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
          }

          .lyl-modal-card {
            width: 100%;
            max-width: 430px;
            background: linear-gradient(
              180deg,
              #0a1d38 0%,
              #08162a 100%
            );
            border: 1px solid rgba(52, 123, 255, 0.28);
            border-radius: 24px;
            padding: 28px 24px 22px;
            box-shadow:
              0 24px 70px rgba(0, 0, 0, 0.42),
              inset 0 0 0 1px rgba(255, 255, 255, 0.02);
            text-align: center;
            color: #ffffff;
          }

          .lyl-modal-icon {
            width: 62px;
            height: 62px;
            border-radius: 50%;
            margin: 0 auto 16px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 28px;
            font-weight: 800;
            color: #ffffff;
            background: linear-gradient(
              180deg,
              #1d73ff 0%,
              #1558c8 100%
            );
            box-shadow: 0 14px 30px rgba(29, 115, 255, 0.25);
          }

          .lyl-modal-icon.danger {
            background: linear-gradient(
              180deg,
              #ef4444 0%,
              #b91c1c 100%
            );
            box-shadow: 0 14px 30px rgba(239, 68, 68, 0.25);
          }

          .lyl-modal-title {
            margin: 0 0 10px;
            font-size: 22px;
            font-weight: 800;
            color: #ffffff;
          }

          .lyl-modal-text {
            margin: 0;
            color: #aec1dc;
            font-size: 14px;
            line-height: 1.65;
          }

          .lyl-modal-actions {
            display: flex;
            gap: 12px;
            margin-top: 24px;
            justify-content: center;
          }

          .lyl-btn {
            min-width: 128px;
            height: 46px;
            border: 0;
            border-radius: 14px;
            font-weight: 700;
            font-size: 14px;
            transition: all 0.2s ease;
          }

          .lyl-btn-primary {
            color: #ffffff;
            background: linear-gradient(
              180deg,
              #1d73ff 0%,
              #1459ca 100%
            );
            box-shadow: 0 12px 24px rgba(29, 115, 255, 0.22);
          }

          .lyl-btn-danger {
            color: #ffffff;
            background: linear-gradient(
              180deg,
              #ef4444 0%,
              #b91c1c 100%
            );
            box-shadow: 0 12px 24px rgba(239, 68, 68, 0.22);
            min-width: 190px;
            width: auto;
            padding: 0 20px;
            white-space: nowrap;
          }

          .lyl-btn-secondary {
            color: #d7e4f7;
            background: rgba(255, 255, 255, 0.06);
            border: 1px solid rgba(255, 255, 255, 0.08);
          }

          .lyl-btn:disabled {
            opacity: 0.65;
            cursor: not-allowed;
          }

          .lyl-toast {
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 1300;
            min-width: 320px;
            max-width: 420px;
            border-radius: 18px;
            padding: 16px 18px;
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 14px;
            color: #ffffff;
            box-shadow: 0 18px 48px rgba(0, 0, 0, 0.3);
            border: 1px solid rgba(255, 255, 255, 0.08);
            backdrop-filter: blur(6px);
          }

          .lyl-toast.success {
            background: linear-gradient(
              180deg,
              rgba(11, 78, 49, 0.97) 0%,
              rgba(8, 52, 34, 0.97) 100%
            );
          }

          .lyl-toast.error {
            background: linear-gradient(
              180deg,
              rgba(110, 19, 30, 0.97) 0%,
              rgba(71, 12, 19, 0.97) 100%
            );
          }

          .lyl-toast-title {
            font-size: 15px;
            font-weight: 800;
            margin-bottom: 3px;
          }

          .lyl-toast-message {
            font-size: 13px;
            line-height: 1.5;
            color: rgba(255, 255, 255, 0.88);
          }

          .lyl-toast-close {
            border: 0;
            background: transparent;
            color: #ffffff;
            font-size: 22px;
            line-height: 1;
            padding: 0;
            opacity: 0.85;
          }

          .lyl-recording-modal {
            background: linear-gradient(
              180deg,
              #09192f 0%,
              #071425 100%
            );
            border: 1px solid rgba(52, 123, 255, 0.22);
            border-radius: 18px;
            padding: 16px;
            box-shadow: 0 24px 60px rgba(0, 0, 0, 0.35);
          }

          .lyl-recording-title {
            color: #ffffff;
            font-weight: 700;
          }

          .lyl-recording-close {
            border-radius: 12px;
          }

          .lyl-teacher-card {
            min-width: 170px;
          }

          .lyl-teacher-name {
            font-size: 13px;
            font-weight: 700;
          }

          .lyl-assistant-line {
            margin-top: 5px;
            color: #d97706;
            font-size: 11px;
            font-weight: 600;
            line-height: 1.4;
          }

          .lyl-assistant-label {
            font-weight: 800;
          }

          .lyl-class-type-badge {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-width: 88px;
            padding: 7px 12px;
            border: 1px solid transparent;
            border-radius: 999px;
            font-size: 11px;
            font-weight: 800;
            line-height: 1;
            white-space: nowrap;
          }

          .lyl-class-type-badge.group {
            color: #2563eb;
            background: rgba(37, 99, 235, 0.12);
            border-color: rgba(37, 99, 235, 0.22);
          }

          .lyl-class-type-badge.one-to-one {
            color: #7c3aed;
            background: rgba(124, 58, 237, 0.12);
            border-color: rgba(124, 58, 237, 0.22);
          }

          .lyl-no-recording {
            display: inline-flex;
            padding: 6px 9px;
            border-radius: 999px;
            color: #dc2626;
            background: rgba(220, 38, 38, 0.10);
            font-size: 10px;
            font-weight: 700;
            white-space: nowrap;
          }

          .lyl-payment-readonly {
            min-width: 100px;
          }

          [data-theme="dark"]
          .lyl-class-type-badge.group,
          [data-bs-theme="dark"]
          .lyl-class-type-badge.group,
          body.dark-theme
          .lyl-class-type-badge.group {
            color: #93c5fd;
            background: rgba(59, 130, 246, 0.18);
            border-color: rgba(147, 197, 253, 0.22);
          }

          [data-theme="dark"]
          .lyl-class-type-badge.one-to-one,
          [data-bs-theme="dark"]
          .lyl-class-type-badge.one-to-one,
          body.dark-theme
          .lyl-class-type-badge.one-to-one {
            color: #c4b5fd;
            background: rgba(139, 92, 246, 0.18);
            border-color: rgba(196, 181, 253, 0.22);
          }

          @media (max-width: 480px) {
            .lyl-modal-actions {
              flex-direction: column-reverse;
            }

            .lyl-modal-actions .lyl-btn {
              width: 100%;
              min-width: 100%;
            }
          }
        `}
      </style>

      <AlertToast
        alertData={alertData}
        onClose={() =>
          setAlertData(
            (previous) => ({
              ...previous,
              open: false,
            })
          )
        }
      />

      <ConfirmActionModal
        open={
          confirmModal.open
        }
        title={
          confirmModal.title
        }
        message={
          confirmModal.message
        }
        confirmText="Yes, Update"
        cancelText="Cancel"
        loadingText="Updating..."
        onConfirm={
          handleConfirmUpdate
        }
        onClose={
          closeConfirmModal
        }
        loading={
          confirmLoading
        }
      />

      <ConfirmActionModal
        open={
          deleteModal.open
        }
        title="Delete Booking"
        message={
          deleteModal.item
            ? `This will permanently delete booking #${getBookingId(
              deleteModal.item
            )} for ${deleteModal.item
              ?.studentname ||
            "the student"
            } with ${deleteModal.item
              ?.teachername ||
            "the teacher"
            }. This action cannot be undone.`
            : "This booking will be permanently deleted. This action cannot be undone."
        }
        confirmText="Yes, Delete Permanently"
        cancelText="Cancel"
        loadingText="Deleting..."
        variant="danger"
        onConfirm={
          handleHardDeleteBooking
        }
        onClose={
          closeDeleteModal
        }
        loading={Boolean(
          deletingBookingId
        )}
      />

      <div className="card-header border-bottom bg-base py-16 px-24 d-flex align-items-center flex-wrap gap-3 justify-content-between">
        <div className="d-flex align-items-center flex-wrap gap-3">
          <input
            type="text"
            className="form-control w-auto"
            placeholder="Search"
            value={searchTerm}
            onChange={(event) =>
              setSearchTerm(
                event.target.value
              )
            }
          />

          <input
            type="date"
            className="form-control w-auto"
            value={startDate}
            onChange={(event) =>
              setStartDate(
                event.target.value
              )
            }
          />

          <input
            type="date"
            className="form-control w-auto"
            value={endDate}
            onChange={(event) =>
              setEndDate(
                event.target.value
              )
            }
          />

          <select
            className="form-select form-select-sm w-auto"
            value={
              paymentTypeFilter
            }
            onChange={(event) =>
              setPaymentTypeFilter(
                event.target.value
              )
            }
          >
            <option value="">
              Payment: All
            </option>

            <option value="direct">
              Direct
            </option>

            <option value="block">
              Block
            </option>

            <option value="subscription">
              Subscription
            </option>

            {paymentOptions
              .filter(
                (payment) =>
                  ![
                    "direct",
                    "block",
                    "subscription",
                  ].includes(
                    payment
                  )
              )
              .map((payment) => (
                <option
                  key={payment}
                  value={payment}
                >
                  {payment}
                </option>
              ))}
          </select>

          <select
            className="form-select form-select-sm w-auto"
            value={
              paymentStatusFilter
            }
            onChange={(event) =>
              setPaymentStatusFilter(
                event.target.value
              )
            }
          >
            <option value="">
              Payment Status: All
            </option>

            <option value="paid">
              Paid
            </option>

            <option value="unpaid">
              Unpaid
            </option>

            <option value="free">
              Free
            </option>

            <option value="pending">
              Pending
            </option>

            <option value="failed">
              Failed
            </option>

            <option value="refunded">
              Refunded
            </option>
          </select>

          <select
            className="form-select form-select-sm w-auto"
            value={
              sessionTypeFilter
            }
            onChange={(event) =>
              setSessionTypeFilter(
                event.target.value
              )
            }
          >
            <option value="">
              Session Type: All
            </option>

            <option value="in-person">
              In-Person
            </option>

            <option value="online">
              Online
            </option>

            {sessionTypeOptions
              .filter(
                (session) =>
                  ![
                    "in-person",
                    "online",
                  ].includes(
                    session
                  )
              )
              .map((session) => (
                <option
                  key={session}
                  value={session}
                >
                  {session}
                </option>
              ))}
          </select>

          <select
            className="form-select form-select-sm w-auto"
            value={
              bookingTypeFilter
            }
            onChange={(event) =>
              setBookingTypeFilter(
                event.target.value
              )
            }
          >
            <option value="">
              Booking Type: All
            </option>

            <option value="manual">
              Manual
            </option>

            <option value="web app">
              Web App
            </option>

            {bookingTypeOptions
              .filter(
                (booking) =>
                  ![
                    "manual",
                    "web app",
                  ].includes(
                    booking
                  )
              )
              .map((booking) => (
                <option
                  key={booking}
                  value={booking}
                >
                  {getBookingTypeDisplay(
                    booking
                  )}
                </option>
              ))}
          </select>

          <select
            className="form-select form-select-sm w-auto"
            value={
              groupFilter
            }
            onChange={(event) => {
              setGroupFilter(
                event.target.value
              );

              if (
                event.target.value !==
                "group"
              ) {
                setGroupBatchFilter(
                  ""
                );
              }
            }}
          >
            <option value="">
              Class Type: All
            </option>

            <option value="one-to-one">
              One-to-One
            </option>

            <option value="group">
              Group
            </option>
          </select>

          <select
            className="form-select form-select-sm w-auto"
            value={
              groupBatchFilter
            }
            onChange={(event) =>
              setGroupBatchFilter(
                event.target.value
              )
            }
            disabled={
              groupFilter ===
              "one-to-one"
            }
          >
            <option value="">
              Batch: All
            </option>

            {groupBatchOptions.map(
              (batch) => (
                <option
                  key={
                    batch.value
                  }
                  value={
                    batch.value
                  }
                >
                  {batch.label}
                </option>
              )
            )}
          </select>

          <select
            className="form-select form-select-sm w-auto"
            value={
              bookingStatusFilter
            }
            onChange={(event) =>
              setBookingStatusFilter(
                event.target.value
              )
            }
          >
            <option value="">
              Status: All
            </option>

            <option value="upcoming">
              Upcoming
            </option>

            <option value="ongoing">
              Ongoing
            </option>

            <option value="completed">
              Completed
            </option>

            <option value="missed">
              Missed
            </option>

            <option value="cancelled">
              Cancelled
            </option>
          </select>

          <button
            type="button"
            className="btn btn-outline-secondary btn-sm"
            onClick={() => {
              setSearchTerm("");
              setPaymentTypeFilter("");
              setBookingStatusFilter("");
              setPaymentStatusFilter("");
              setSessionTypeFilter("");
              setBookingTypeFilter("");
              setGroupFilter("");
              setGroupBatchFilter("");
              setStartDate("");
              setEndDate("");
              setCurrentPage(1);
            }}
          >
            Reset Filters
          </button>

          <button
            type="button"
            className="btn btn-success btn-sm"
            onClick={
              exportToExcel
            }
          >
            Excel Export
          </button>

          <button
            type="button"
            className="btn btn-danger btn-sm"
            onClick={
              exportToPDF
            }
          >
            PDF Export
          </button>
        </div>

        <button
          type="button"
          className="btn btn-primary btn-sm d-flex align-items-center gap-2"
          style={{
            borderRadius:
              "999px",

            padding:
              "10px 18px",

            boxShadow:
              "0 10px 22px rgba(13, 110, 253, 0.22)",
          }}
          onClick={() =>
            setIsManualBookingOpen(
              true
            )
          }
        >
          <span
            style={{
              width: 20,
              height: 20,

              borderRadius:
                "50%",

              background:
                "rgba(255, 255, 255, 0.2)",

              display: "flex",

              alignItems:
                "center",

              justifyContent:
                "center",

              fontWeight:
                "bold",
            }}
          >
            +
          </span>

          Create Booking
        </button>
      </div>

      <div className="card-body p-24">
        {loadError ? (
          <div className="alert alert-danger d-flex align-items-center justify-content-between">
            <div>
              {loadError}
            </div>

            <button
              type="button"
              className="btn btn-sm btn-outline-light"
              onClick={
                fetchBookings
              }
            >
              Reload
            </button>
          </div>
        ) : null}

        <div
          className="alert alert-info py-2 px-3 mb-3"
          style={{
            fontWeight: 600,
          }}
        >
          All booking dates and times are shown in Asia/Dubai timezone.
        </div>

        <div className="table-responsive">
          <table className="table bordered-table sm-table mb-0">
            <thead>
              <tr>
                <th>S.L</th>

                <th>
                  Reschedule Booking
                </th>

                <th>
                  Book Date
                </th>

                <th>
                  Recording
                </th>

                <th>
                  Student Name
                </th>

                <th>
                  Teacher Name
                </th>

                <th>
                  Slot Start
                </th>

                <th>
                  Slot End
                </th>

                <th>
                  Amount
                </th>

                <th>
                  Payment Type
                </th>

                <th>
                  Payment Status
                </th>

                <th>
                  Session Type
                </th>

                <th>
                  Booking Type
                </th>

                <th>
                  Class Type
                </th>

                <th>
                  Status
                </th>

                <th>
                  Action
                </th>
              </tr>
            </thead>

            <tbody>
              {currentItems.length ===
                0 ? (
                <tr>
                  <td
                    colSpan={16}
                    className="text-center"
                  >
                    No records found.
                  </td>
                </tr>
              ) : (
                currentItems.map(
                  (
                    item,
                    index
                  ) => {
                    const status =
                      getBookingStatus(
                        item
                      );

                    const recordingUrl =
                      normalizeRecordingUrl(
                        item
                          ?.recording_s3_url
                      );

                    const bookingDate =
                      getDubaiBookDateMoment(
                        item
                      );

                    const rescheduleDisabled =
                      isRescheduleDisabled(
                        item
                      );

                    const bookingId =
                      getBookingId(
                        item
                      );

                    const paymentSaving =
                      isFieldSaving(
                        bookingId,
                        "payment_status"
                      );

                    const sessionSaving =
                      isFieldSaving(
                        bookingId,
                        "session_type"
                      );

                    const amountSaving =
                      isFieldSaving(
                        bookingId,
                        "amount"
                      );

                    const deleteLoading =
                      String(
                        deletingBookingId
                      ) ===
                      String(
                        bookingId
                      );

                    const deleteDisabled =
                      isDeleteDisabled(
                        item
                      );

                    const currentPaymentStatus =
                      getResolvedPaymentStatus(
                        item
                      );

                    const assistantNames =
                      getGroupAssistantNames(
                        item
                      );

                    const currentSessionType =
                      getSessionTypeDisplay(
                        item
                          ?.session_type
                      );

                    return (
                      <tr
                        key={
                          makeRowKey(
                            item
                          )
                        }
                      >
                        <td>
                          {indexOfFirstItem +
                            index +
                            1}
                        </td>

                        <td>
                          <button
                            type="button"
                            className={`btn btn-sm ${rescheduleDisabled
                                ? "btn-outline-secondary"
                                : "btn-outline-primary"
                              }`}
                            onClick={() => {
                              if (
                                !rescheduleDisabled
                              ) {
                                openRescheduleModal(
                                  item
                                );
                              }
                            }}
                            disabled={
                              rescheduleDisabled
                            }
                            title={
                              isGroupBooking(
                                item
                              )
                                ? "Group bookings cannot be rescheduled from this list"
                                : rescheduleDisabled
                                  ? "This booking cannot be rescheduled after the session start time"
                                  : "Reschedule booking"
                            }
                            style={{
                              minWidth:
                                "110px",

                              borderRadius:
                                "8px",

                              fontWeight:
                                600,

                              cursor:
                                rescheduleDisabled
                                  ? "not-allowed"
                                  : "pointer",

                              opacity:
                                rescheduleDisabled
                                  ? 0.6
                                  : 1,
                            }}
                          >
                            Reschedule
                          </button>
                        </td>

                        <td>
                          {bookingDate
                            ? bookingDate.format(
                              "DD MMM YYYY"
                            )
                            : "-"}
                        </td>

                        <td>
                          {recordingUrl ? (
                            <button
                              type="button"
                              className="btn btn-outline-primary btn-sm"
                              onClick={() =>
                                openRecording(
                                  item
                                )
                              }
                            >
                              View
                            </button>
                          ) : norm(
                            status
                          ) ===
                            "missed" ? (
                            <span className="lyl-no-recording">
                              No Recording
                            </span>
                          ) : (
                            "-"
                          )}
                        </td>

                        <td>
                          {item?.studentname ||
                            "-"}
                        </td>

                        <td>
                          <div className="lyl-teacher-card">
                            <div className="lyl-teacher-name">
                              {getMainTeacherText(
                                item
                              )}
                            </div>

                            {isGroupBooking(
                              item
                            ) &&
                              assistantNames.length >
                              0 ? (
                              <div className="lyl-assistant-line">
                                <span className="lyl-assistant-label">
                                  Assistant:
                                </span>{" "}
                                {assistantNames.join(
                                  ", "
                                )}
                              </div>
                            ) : null}
                          </div>
                        </td>

                        <td>
                          {formatDubaiBookingTime(
                            item,
                            "start"
                          )}
                        </td>

                        <td>
                          {formatDubaiBookingTime(
                            item,
                            "end"
                          )}
                        </td>

                        <td>
                          {isDirectBooking(
                            item
                          ) ? (
                            <div
                              style={{
                                display:
                                  "flex",

                                gap: "8px",

                                alignItems:
                                  "center",
                              }}
                            >
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                className="form-control form-control-sm"
                                style={{
                                  width:
                                    "110px",
                                }}
                                value={
                                  amountDraftMap[
                                  bookingId
                                  ] ??
                                  getAmountValue(
                                    item
                                  )
                                }
                                disabled={
                                  amountSaving
                                }
                                onChange={(
                                  event
                                ) => {
                                  const value =
                                    event
                                      .target
                                      .value;

                                  setAmountDraftMap(
                                    (
                                      previous
                                    ) => ({
                                      ...previous,

                                      [bookingId]:
                                        value,
                                    })
                                  );
                                }}
                              />

                              <button
                                type="button"
                                className="btn btn-sm btn-outline-primary"
                                disabled={
                                  amountSaving
                                }
                                onClick={() => {
                                  const value =
                                    amountDraftMap[
                                    bookingId
                                    ] ??
                                    getAmountValue(
                                      item
                                    );

                                  openConfirmModal(
                                    item,
                                    "amount",
                                    value
                                  );
                                }}
                              >
                                Save
                              </button>
                            </div>
                          ) : (
                            getAmountText(
                              item
                            )
                          )}

                          {amountSaving ? (
                            <div className="lyl-cell-note">
                              Updating...
                            </div>
                          ) : null}
                        </td>

                        <td>
                          <span
                            className={`badge ${getPaymentTypeBadgeClass(
                              item
                                ?.payment_type
                            )}`}
                          >
                            {item
                              ?.payment_type ||
                              "-"}
                          </span>
                        </td>

                        <td>
                          {[
                            "Pending",
                            "Failed",
                            "Refunded",
                          ].includes(
                            currentPaymentStatus
                          ) ? (
                            <div className="lyl-payment-readonly">
                              <span
                                className={`badge ${currentPaymentStatus ===
                                    "Pending"
                                    ? "bg-warning text-dark"
                                    : "bg-danger"
                                  }`}
                              >
                                {currentPaymentStatus}
                              </span>
                            </div>
                          ) : (
                            <DarkSelectEditor
                              value={
                                currentPaymentStatus
                              }
                              options={
                                PAYMENT_STATUS_OPTIONS
                              }
                              loading={
                                paymentSaving
                              }
                              onChange={(
                                value
                              ) =>
                                openConfirmModal(
                                  item,
                                  "payment_status",
                                  value
                                )
                              }
                            />
                          )}

                          {paymentSaving ? (
                            <div className="lyl-cell-note">
                              Updating...
                            </div>
                          ) : null}
                        </td>

                        <td>
                          <DarkSelectEditor
                            value={
                              currentSessionType
                            }
                            options={
                              SESSION_TYPE_OPTIONS
                            }
                            loading={
                              sessionSaving
                            }
                            onChange={(
                              value
                            ) =>
                              openConfirmModal(
                                item,
                                "session_type",
                                value
                              )
                            }
                          />

                          {sessionSaving ? (
                            <div className="lyl-cell-note">
                              Updating...
                            </div>
                          ) : null}
                        </td>

                        <td>
                          <span
                            className={`badge ${getBookingTypeBadgeClass(
                              item
                                ?.booking_type
                            )}`}
                          >
                            {getBookingTypeDisplay(
                              item
                                ?.booking_type
                            )}
                          </span>
                        </td>

                        <td>
                          <span
                            className={`lyl-class-type-badge ${isGroupBooking(
                              item
                            )
                                ? "group"
                                : "one-to-one"
                              }`}
                          >
                            {isGroupBooking(
                              item
                            )
                              ? "Group"
                              : "One-to-One"}
                          </span>
                        </td>

                        <td>
                          <span
                            className={`badge ${getBookingStatusBadgeClass(
                              status
                            )}`}
                          >
                            {status
                              ? status
                                .charAt(0)
                                .toUpperCase() +
                              status.slice(
                                1
                              )
                              : "-"}
                          </span>
                        </td>

                        <td>
                          <button
                            type="button"
                            className={`btn btn-sm ${deleteDisabled
                                ? "btn-outline-secondary"
                                : "btn-outline-danger"
                              }`}
                            disabled={
                              deleteDisabled ||
                              deleteLoading
                            }
                            onClick={() => {
                              if (
                                !deleteDisabled
                              ) {
                                openDeleteModal(
                                  item
                                );
                              }
                            }}
                            title={
                              isGroupBooking(
                                item
                              )
                                ? "Group bookings cannot be deleted using this action"
                                : deleteDisabled
                                  ? "Past completed bookings cannot be deleted"
                                  : "Permanently delete this booking"
                            }
                            style={{
                              minWidth:
                                "90px",

                              borderRadius:
                                "8px",

                              fontWeight:
                                600,

                              cursor:
                                deleteDisabled ||
                                  deleteLoading
                                  ? "not-allowed"
                                  : "pointer",

                              opacity:
                                deleteDisabled
                                  ? 0.6
                                  : 1,
                            }}
                          >
                            {deleteLoading
                              ? "Deleting..."
                              : "Delete"}
                          </button>
                        </td>
                      </tr>
                    );
                  }
                )
              )}
            </tbody>
          </table>
        </div>

        <div className="d-flex flex-wrap justify-content-between align-items-center gap-3 mt-3">
          <span>
            Showing{" "}
            {filteredData.length === 0
              ? 0
              : indexOfFirstItem + 1}{" "}
            to{" "}
            {Math.min(
              indexOfLastItem,
              filteredData.length
            )}{" "}
            of{" "}
            {filteredData.length}{" "}
            entries
          </span>

          <div className="d-flex align-items-center gap-2">
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              onClick={() =>
                setCurrentPage((page) =>
                  Math.max(1, page - 1)
                )
              }
              disabled={safePage <= 1}
            >
              Previous
            </button>

            <span className="small">
              Page {safePage} of {totalPages}
            </span>

            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              onClick={() =>
                setCurrentPage((page) =>
                  Math.min(
                    totalPages,
                    page + 1
                  )
                )
              }
              disabled={safePage >= totalPages}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {isRecordingOpen ? (
        <div
          className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center"
          style={{
            background:
              "rgba(0, 0, 0, 0.68)",

            zIndex: 1050,
          }}
          role="dialog"
          aria-modal="true"
          onClick={
            closeRecording
          }
        >
          <div
            className="lyl-recording-modal"
            style={{
              width:
                "min(900px, 92vw)",
            }}
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <div className="d-flex justify-content-between align-items-center mb-2">
              <h6 className="mb-0 lyl-recording-title">
                Recording
              </h6>

              <button
                type="button"
                className="btn btn-sm btn-outline-light lyl-recording-close"
                onClick={
                  closeRecording
                }
              >
                Close
              </button>
            </div>

            {activeRecordingUrl ? (
              <video
                src={
                  activeRecordingUrl
                }
                controls
                autoPlay
                style={{
                  width:
                    "100%",

                  maxHeight:
                    "70vh",

                  background:
                    "#000000",

                  borderRadius:
                    "12px",
                }}
              />
            ) : (
              <div className="text-center py-5 text-white">
                Recording not available
              </div>
            )}
          </div>
        </div>
      ) : null}

      <RescheduleBookingModal
        key={
          selectedBooking
            ?.bookingid ||
          selectedBooking
            ?.booking_id ||
          "reschedule"
        }
        isOpen={
          isRescheduleOpen
        }
        onClose={
          closeRescheduleModal
        }
        onSuccess={
          fetchBookings
        }
        booking={
          selectedBooking
        }
        timezone={
          selectedBooking &&
            isGroupBooking(
              selectedBooking
            )
            ? TZ
            : selectedBooking
              ?.studentTime_zone ||
            TZ
        }
      />

      <ManualBookingModal
        isOpen={
          isManualBookingOpen
        }
        title="Manual Booking"
        onClose={() =>
          setIsManualBookingOpen(
            false
          )
        }
      />
    </div>
  );
};

export default RoleAccessLayer;