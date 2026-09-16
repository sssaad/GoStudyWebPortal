import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import moment from "moment-timezone";
import { getAllBookings } from "../api/getAllBookings";
import { getToken } from "../api/getToken";
import RescheduleBookingModal from "./RescheduleBookingModal";

const UPDATE_DYNAMIC_DATA_URL =
  "https://api.learnyourlanguage.org/RestController_Thirdparty.php?view=update_dynamic_data";

const API_HEADERS = {
  projectid: "1",
  userid: "test",
  password: "test",
  "x-api-key": "abc123456789",
  "Content-Type": "application/json",
};

const PAYMENT_STATUS_OPTIONS = ["Paid", "Unpaid", "Free"];

const INPERSON_STATUS_OPTIONS = [
  "Upcoming",
  "Ongoing",
  "Completed",
  "Cancelled",
  "Missed",
];

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
        onChange={(e) =>
          onChange(e.target.value)
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
  onConfirm,
  onClose,
  loading,
}) => {
  if (!open) {
    return null;
  }

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
        onClick={(e) =>
          e.stopPropagation()
        }
      >
        <div className="lyl-modal-icon">
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
            className="lyl-btn lyl-btn-primary"
            onClick={onConfirm}
            disabled={loading}
          >
            {loading
              ? "Updating..."
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
      className={`lyl-toast ${
        alertData.type === "success"
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

const InpersonBookingLayer = () => {
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
    bookingStatusFilter,
    setBookingStatusFilter,
  ] = useState("");

  const [
    paymentStatusFilter,
    setPaymentStatusFilter,
  ] = useState("");

  const [
    bookingTypeFilter,
    setBookingTypeFilter,
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

  const itemsPerPage = 10;

  const [
    isRescheduleOpen,
    setIsRescheduleOpen,
  ] = useState(false);

  const [
    selectedBooking,
    setSelectedBooking,
  ] = useState(null);

  const [
    reloadNonce,
    setReloadNonce,
  ] = useState(0);

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
    amountDraftMap,
    setAmountDraftMap,
  ] = useState({});

  const [
    autoSyncing,
    setAutoSyncing,
  ] = useState(false);

  const [
    alertData,
    setAlertData,
  ] = useState({
    open: false,
    type: "success",
    title: "",
    message: "",
  });

  const TZ = "Asia/Dubai";

  const cleanTimezone = (
    value
  ) =>
    String(value || "")
      .replace(/\\\//g, "/")
      .trim();

  const getStudentTimezone = (
    item
  ) => {
    const tz =
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

    return moment.tz.zone(tz)
      ? tz
      : TZ;
  };

  const norm = (value) =>
    String(value ?? "")
      .toLowerCase()
      .trim();

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

    setTimeout(() => {
      setAlertData(
        (previous) => ({
          ...previous,
          open: false,
        })
      );
    }, 3000);
  };

  /*
   * =========================================================
   * GROUP HELPERS
   * =========================================================
   */

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

  /*
   * =========================================================
   * BOOKING DATE / TIME
   * =========================================================
   */

  const getBookDateValue = (
    item
  ) =>
    item?.bookdate ||
    item?.booking_date ||
    item?.group_session_date ||
    "";

  const getSlotStartValue = (
    item
  ) =>
    item?.slot_start ||
    item?.booking_start_time ||
    item?.group_session_start ||
    "";

  const getSlotEndValue = (
    item
  ) =>
    item?.slot_end ||
    item?.booking_end_time ||
    item?.group_session_end ||
    "";

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
    const dateStr =
      getBookDateValue(item);

    const timeStr =
      type === "end"
        ? getSlotEndValue(item)
        : getSlotStartValue(item);

    if (!dateStr) {
      return null;
    }

    /*
     * bookteacher date/time is normally
     * stored according to the student's
     * booking timezone.
     *
     * Group official session fallback
     * fields are already Dubai time.
     */
    const hasBookteacherDateTime =
      Boolean(item?.bookdate) &&
      Boolean(
        type === "end"
          ? item?.slot_end
          : item?.slot_start
      );

    const sourceTZ =
      isGroupBooking(item) &&
      !hasBookteacherDateTime
        ? TZ
        : getStudentTimezone(
            item
          );

    const dtString =
      timeStr
        ? `${dateStr} ${timeStr}`
        : `${dateStr} 00:00:00`;

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
        dtString,
        formats,
        true,
        sourceTZ
      );

    if (!parsed.isValid()) {
      parsed =
        moment.tz(
          dtString,
          formats,
          sourceTZ
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

    const dateStr =
      getBookDateValue(item);

    if (!dateStr) {
      return null;
    }

    const sourceTZ =
      isGroupBooking(item) &&
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
        dateStr,
        formats,
        true,
        sourceTZ
      );

    if (!parsed.isValid()) {
      parsed =
        moment.tz(
          dateStr,
          formats,
          sourceTZ
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
    const parsed =
      parseBookingDateTime(
        item,
        type
      );

    return parsed?.isValid?.()
      ? parsed.format(
          "hh:mm A"
        )
      : "-";
  };

  /*
   * =========================================================
   * SESSION TYPE
   * =========================================================
   */

  const getSessionTypeKey = (
    value
  ) => {
    const type =
      norm(value)
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

  const isInPersonSession = (
    item
  ) =>
    getSessionTypeKey(
      item?.session_type
    ) === "in-person";

  /*
   * =========================================================
   * PAYMENT STATUS
   * =========================================================
   */

  const getPaymentStatusDisplay = (
    value
  ) => {
    const status =
      norm(value);

    if (status === "paid") {
      return "Paid";
    }

    if (status === "unpaid") {
      return "Unpaid";
    }

    if (status === "free") {
      return "Free";
    }

    return "Unpaid";
  };

  /*
   * =========================================================
   * IN-PERSON STATUS
   * =========================================================
   */

  const getInpersonStatusDisplay = (
    value
  ) => {
    const status =
      norm(value);

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

  const getStatusLabel = (
    status
  ) => {
    const value =
      norm(status);

    if (
      value === "upcoming"
    ) {
      return "Upcoming";
    }

    if (
      value === "ongoing"
    ) {
      return "Ongoing";
    }

    if (
      value === "completed"
    ) {
      return "Completed";
    }

    if (
      value === "cancelled"
    ) {
      return "Cancelled";
    }

    if (
      value === "missed"
    ) {
      return "Missed";
    }

    return "Upcoming";
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

      setSelectedBooking(
        null
      );
    };

  const refreshBookings = () => {
    setReloadNonce(
      (previous) =>
        previous + 1
    );
  };

  const getNow = () =>
    moment.tz(TZ);

  /*
   * These two functions are kept
   * because they were present in
   * the existing component.
   */
  const parseBookDate = (
    value
  ) => {
    if (!value) {
      return null;
    }

    const input =
      String(value).trim();

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
        input,
        formats,
        true,
        TZ
      );

    if (!parsed.isValid()) {
      parsed =
        moment.tz(
          input,
          formats,
          TZ
        );
    }

    if (!parsed.isValid()) {
      parsed =
        moment.tz(
          input,
          TZ
        );
    }

    return parsed.isValid()
      ? parsed
      : null;
  };

  const parseDateTime = (
    dateStr,
    timeStr
  ) => {
    if (!dateStr) {
      return null;
    }

    const dtString =
      timeStr
        ? `${dateStr} ${timeStr}`
        : `${dateStr} 23:59:59`;

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
        dtString,
        formats,
        true,
        TZ
      );

    if (!parsed.isValid()) {
      parsed =
        moment.tz(
          dtString,
          formats,
          TZ
        );
    }

    return parsed.isValid()
      ? parsed
      : null;
  };

  /*
   * Group In-Person and One-to-One
   * In-Person both use the same
   * time-based status logic.
   *
   * Important:
   * Group In-Person does NOT require
   * a recording to become Completed.
   */
  const calculateInpersonAutoStatus = (
    item
  ) => {
    const now =
      getNow();

    const date =
      getBookDateValue(
        item
      );

    const start =
      getSlotStartValue(
        item
      );

    const end =
      getSlotEndValue(
        item
      );

    if (!date) {
      return "Upcoming";
    }

    const startDT =
      start
        ? parseBookingDateTime(
            item,
            "start"
          )
        : null;

    const endDT =
      end
        ? parseBookingDateTime(
            item,
            "end"
          )
        : null;

    if (endDT) {
      if (
        now.isAfter(
          endDT
        )
      ) {
        return "Completed";
      }

      if (
        startDT &&
        now.isSameOrAfter(
          startDT
        ) &&
        now.isSameOrBefore(
          endDT
        )
      ) {
        return "Ongoing";
      }

      return "Upcoming";
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
      now.isAfter(
        dayEnd
      )
    ) {
      return "Completed";
    }

    return "Upcoming";
  };

  const getBookingStatus = (
    item
  ) => {
    const dbStatus =
      getInpersonStatusDisplay(
        item?.inperson_status
      );

    if (
      isInPersonSession(item) &&
      dbStatus
    ) {
      return norm(
        dbStatus
      );
    }

    return norm(
      calculateInpersonAutoStatus(
        item
      )
    );
  };

  const getInpersonDropdownValue = (
    item
  ) => {
    return getStatusLabel(
      getBookingStatus(
        item
      )
    );
  };

  /*
   * =========================================================
   * RESCHEDULE RULES
   * =========================================================
   *
   * GROUP:
   * Never reschedule from this page.
   *
   * ONE-TO-ONE:
   * Existing behaviour preserved.
   * Manual Missed can be rescheduled.
   */
  const isRescheduleDisabled = (
    item
  ) => {
    if (
      isGroupBooking(item)
    ) {
      return true;
    }

    const manualStatus =
      norm(
        item?.inperson_status
      );

    const statusMode =
      norm(
        item?.inperson_status_mode ||
          "auto"
      );

    if (
      isInPersonSession(item) &&
      statusMode === "manual" &&
      manualStatus === "missed"
    ) {
      return false;
    }

    const bookingDate =
      getDubaiBookDateMoment(
        item
      );

    if (!bookingDate) {
      return false;
    }

    return bookingDate.isBefore(
      getNow(),
      "day"
    );
  };

  const getBookingStatusBadgeClass = (
    status
  ) => {
    const value =
      norm(status);

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
      value === "cancelled"
    ) {
      return "bg-danger";
    }

    if (
      value === "missed"
    ) {
      return "bg-danger";
    }

    return "bg-warning text-dark";
  };

  const getPaymentTypeBadgeClass = (
    type
  ) => {
    const value =
      norm(type);

    if (
      value === "direct"
    ) {
      return "bg-success";
    }

    if (
      value === "block"
    ) {
      return "bg-primary";
    }

    if (
      value === "subscription"
    ) {
      return "bg-warning text-dark";
    }

    return "bg-secondary";
  };

  const getSessionTypeBadgeClass = (
    type
  ) => {
    const value =
      getSessionTypeKey(
        type
      );

    if (
      value === "in-person"
    ) {
      return "bg-dark";
    }

    if (
      value === "online"
    ) {
      return "bg-info";
    }

    return "bg-secondary";
  };

  const getBookingTypeBadgeClass = (
    type
  ) => {
    const value =
      norm(type);

    if (
      value === "manual"
    ) {
      return "bg-primary";
    }

    if (
      value === "web app"
    ) {
      return "bg-success";
    }

    return "bg-secondary";
  };

  /*
   * =========================================================
   * AMOUNT
   * =========================================================
   */

  const getAmountValue = (
    item
  ) => {
    const rawAmount =
      item?.booking_amount ??
      item?.amount ??
      0;

    const amount =
      Number(
        String(
          rawAmount ?? "0"
        )
          .replace(
            /,/g,
            ""
          )
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
  ) => {
    const value =
      getAmountValue(
        item
      );

    return `AED ${value.toFixed(
      2
    )}`;
  };

  const formatTime = (
    time
  ) => {
    if (!time) {
      return "-";
    }

    const parsed =
      moment(
        time,
        [
          "HH:mm:ss",
          "HH:mm",
        ],
        true
      );

    if (!parsed.isValid()) {
      return "-";
    }

    return parsed.format(
      "hh:mm A"
    );
  };

  /*
   * =========================================================
   * CONSOLIDATE GROUP BOOKINGS
   * =========================================================
   *
   * Same student + same group session:
   * Main teacher row becomes base row.
   * Assistant rows are merged underneath.
   */
  const makeRowKey = (
    item
  ) => {
    if (
      isGroupBooking(item)
    ) {
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

    const date =
      getBookDateValue(item) ||
      "na";

    const start =
      getSlotStartValue(item) ||
      "na";

    const end =
      getSlotEndValue(item) ||
      "na";

    const teacher =
      item?.teachername ??
      "na";

    const student =
      item?.studentname ??
      "na";

    const studentId =
      item?.studentid ??
      "na";

    return [
      bookingId,
      date,
      start,
      end,
      teacher,
      student,
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

        /*
         * One-to-One keeps its
         * existing dedupe behaviour.
         */
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

        /*
         * Group rows sharing the same
         * programme/batch/session/student
         * are merged.
         */
        if (
          !groupMap.has(
            key
          )
        ) {
          groupMap.set(
            key,
            {
              rows: [],
              mainRow: null,
            }
          );
        }

        const group =
          groupMap.get(key);

        group.rows.push(
          item
        );

        /*
         * Main row means any row
         * which is NOT an assistant.
         */
        if (
          !isAssistantTeacherRow(
            item
          ) &&
          !group.mainRow
        ) {
          group.mainRow =
            item;
        }
      }
    );

    const consolidatedGroupRows =
      Array.from(
        groupMap.values()
      ).map(
        (group) => {
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
            .forEach(
              (row) => {
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
              }
            );

          return {
            ...baseRow,

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
                baseRow
                  ?.teachername ||
                "Main Teacher N/A",
            },

            _group_assistant_teachers:
              Array.from(
                assistantMap.values()
              ),
          };
        }
      );

    return [
      ...oneToOneMap.values(),
      ...consolidatedGroupRows,
    ];
  };

  /*
   * =========================================================
   * TOKEN
   * =========================================================
   */

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
          ?.data?.token ===
        "string"
      ) {
        return tokenResponse
          .data.token;
      }

      if (
        typeof tokenResponse
          ?.data?.data
          ?.token === "string"
      ) {
        return tokenResponse
          .data.data.token;
      }

      return "";
    };

  /*
   * =========================================================
   * SAVING STATE
   * =========================================================
   */

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

  /*
   * =========================================================
   * DATABASE UPDATE
   * =========================================================
   */

  const updateDynamicBookingData =
    async (
      item,
      updates = {}
    ) => {
      const bookingId =
        getBookingId(item);

      if (!bookingId) {
        throw new Error(
          "Booking ID not found."
        );
      }

      const token =
        await getTokenValue();

      if (!token) {
        throw new Error(
          "Token not found."
        );
      }

      const conditionId =
        /^\d+$/.test(
          String(bookingId)
        )
          ? Number(
              bookingId
            )
          : bookingId;

      const updateData = {};

      if (
        Object.prototype
          .hasOwnProperty.call(
            updates,
            "payment_status"
          )
      ) {
        updateData.payment_status =
          updates.payment_status;
      }

      if (
        Object.prototype
          .hasOwnProperty.call(
            updates,
            "amount"
          )
      ) {
        updateData.amount =
          updates.amount;
      }

      if (
        Object.prototype
          .hasOwnProperty.call(
            updates,
            "inperson_status"
          )
      ) {
        updateData.inperson_status =
          updates.inperson_status;
      }

      if (
        Object.prototype
          .hasOwnProperty.call(
            updates,
            "inperson_status_mode"
          )
      ) {
        updateData.inperson_status_mode =
          updates.inperson_status_mode;
      }

      if (
        Object.keys(
          updateData
        ).length === 0
      ) {
        throw new Error(
          "Update data not found."
        );
      }

      const payload = {
        token,

        tablename:
          "bookteacher",

        conditions: [
          {
            id:
              conditionId,
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
            "Update failed"
        );
      }

      return response.data;
    };

  /*
   * =========================================================
   * AUTO SYNC IN-PERSON STATUS
   * =========================================================
   */

  const syncInpersonStatusesToDb =
    async (
      list = []
    ) => {
      if (autoSyncing) {
        return;
      }

      setAutoSyncing(true);

      try {
        const inpersonRows =
          (list || []).filter(
            (item) =>
              isInPersonSession(
                item
              )
          );

        for (
          const item of
          inpersonRows
        ) {
          const bookingId =
            getBookingId(
              item
            );

          if (!bookingId) {
            continue;
          }

          const mode =
            norm(
              item?.inperson_status_mode ||
                "auto"
            );

          /*
           * Never overwrite
           * administrator manual status.
           */
          if (
            mode === "manual"
          ) {
            continue;
          }

          const calculatedStatus =
            calculateInpersonAutoStatus(
              item
            );

          const currentDbStatus =
            getInpersonStatusDisplay(
              item?.inperson_status
            );

          if (
            currentDbStatus ===
            calculatedStatus
          ) {
            continue;
          }

          try {
            await updateDynamicBookingData(
              item,
              {
                inperson_status:
                  calculatedStatus,

                inperson_status_mode:
                  "auto",
              }
            );

            patchRow(
              bookingId,
              {
                inperson_status:
                  calculatedStatus,

                inperson_status_mode:
                  "auto",
              }
            );
          } catch (error) {
            console.error(
              "In-Person status auto sync failed:",
              error
            );
          }
        }
      } finally {
        setAutoSyncing(
          false
        );
      }
    };

  /*
   * =========================================================
   * CONFIRM MODAL
   * =========================================================
   */

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
      "inperson_status"
    ) {
      const currentValue =
        getInpersonDropdownValue(
          item
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
          "Update Booking Status",

        message:
          `Are you sure you want to change status from "${currentValue}" to "${newValue}"?`,
      });

      return;
    }

    if (
      field === "amount"
    ) {
      const currentValue =
        getAmountValue(
          item
        );

      const nextValue =
        Number(
          String(
            newValue ?? "0"
          )
            .replace(
              /,/g,
              ""
            )
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
      if (
        confirmLoading
      ) {
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
        getBookingId(
          item
        );

      if (!bookingId) {
        showAlert(
          "error",
          "Update Failed",
          "Booking ID not found."
        );

        closeConfirmModal();

        return;
      }

      setConfirmLoading(
        true
      );

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
              "amount"
            ? getAmountValue(
                item
              )
            : {
                inperson_status:
                  item?.inperson_status,

                inperson_status_mode:
                  item?.inperson_status_mode,
              };

      let optimisticPatch = {};
      let updatePayload = {};

      if (
        field ===
        "payment_status"
      ) {
        optimisticPatch = {
          payment_status:
            newValue,
        };

        updatePayload = {
          payment_status:
            newValue,
        };
      } else if (
        field === "amount"
      ) {
        optimisticPatch = {
          booking_amount:
            newValue,
        };

        updatePayload = {
          amount:
            newValue,
        };
      } else if (
        field ===
        "inperson_status"
      ) {
        if (
          newValue === "Auto"
        ) {
          const autoStatus =
            calculateInpersonAutoStatus(
              item
            );

          optimisticPatch = {
            inperson_status:
              autoStatus,

            inperson_status_mode:
              "auto",
          };

          updatePayload = {
            inperson_status:
              autoStatus,

            inperson_status_mode:
              "auto",
          };
        } else {
          optimisticPatch = {
            inperson_status:
              newValue,

            inperson_status_mode:
              "manual",
          };

          updatePayload = {
            inperson_status:
              newValue,

            inperson_status_mode:
              "manual",
          };
        }
      }

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
          updatePayload
        );

        if (
          field ===
          "amount"
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
          `${confirmModal.title} done successfully.`
        );

        closeConfirmModal();
      } catch (error) {
        if (
          field ===
          "payment_status"
        ) {
          patchRow(
            bookingId,
            {
              payment_status:
                previousValue,
            }
          );
        } else if (
          field === "amount"
        ) {
          patchRow(
            bookingId,
            {
              booking_amount:
                previousValue,
            }
          );

          setAmountDraftMap(
            (previous) => ({
              ...previous,

              [bookingId]:
                previousValue,
            })
          );
        } else if (
          field ===
          "inperson_status"
        ) {
          patchRow(
            bookingId,
            {
              inperson_status:
                previousValue
                  .inperson_status,

              inperson_status_mode:
                previousValue
                  .inperson_status_mode,
            }
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

  /*
   * =========================================================
   * FETCH BOOKINGS
   * =========================================================
   */

  useEffect(() => {
    let alive = true;

    const fetchData =
      async () => {
        setInitialLoading(
          true
        );

        setLoadError("");

        try {
          const data =
            await getAllBookings();

          const raw =
            Array.isArray(
              data
            )
              ? data
              : Array.isArray(
                    data?.data
                  )
                ? data.data
                : Array.isArray(
                      data
                        ?.getall_bookings
                    )
                  ? data
                      .getall_bookings
                  : Array.isArray(
                        data
                          ?.getallbookings
                      )
                    ? data
                        .getallbookings
                    : [];

          /*
           * IMPORTANT:
           * This replaces the old basic
           * dedupe method.
           *
           * One-to-One remains deduped.
           * Group main/assistant rows merge.
           */
          const consolidated =
            consolidateBookings(
              raw
            );

          const sorted =
            consolidated
              .slice()
              .sort(
                (a, b) => {
                  const firstDate =
                    getDubaiBookDateMoment(
                      a
                    );

                  const secondDate =
                    getDubaiBookDateMoment(
                      b
                    );

                  return (
                    (
                      secondDate
                        ?.valueOf?.() ||
                      0
                    ) -
                    (
                      firstDate
                        ?.valueOf?.() ||
                      0
                    )
                  );
                }
              );

          if (!alive) {
            return;
          }

          setRows(
            sorted
          );

          setTimeout(
            () => {
              syncInpersonStatusesToDb(
                sorted
              );
            },
            0
          );
        } catch (error) {
          if (!alive) {
            return;
          }

          console.error(
            "getAllBookings failed:",
            error
          );

          setRows([]);

          setLoadError(
            "Bookings are not loading. Please check the Network."
          );
        } finally {
          if (!alive) {
            return;
          }

          setInitialLoading(
            false
          );
        }
      };

    fetchData();

    return () => {
      alive = false;
    };
  }, [reloadNonce]);

  /*
   * Reset pagination whenever
   * filters change.
   */
  useEffect(() => {
    setCurrentPage(1);
  }, [
    searchTerm,
    bookingStatusFilter,
    paymentStatusFilter,
    bookingTypeFilter,
    startDate,
    endDate,
  ]);

  /*
   * =========================================================
   * BOOKING TYPE OPTIONS
   * =========================================================
   */

  const bookingTypeOptions =
    useMemo(() => {
      const options =
        new Set();

      (rows || []).forEach(
        (row) => {
          if (
            isInPersonSession(
              row
            )
          ) {
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
        }
      );

      return Array.from(
        options
      );
    }, [rows]);

  /*
   * =========================================================
   * FILTERS
   * =========================================================
   */

  const filteredData =
    useMemo(() => {
      const normalizedSearch =
        norm(searchTerm);

      const normalizedStatus =
        norm(
          bookingStatusFilter
        );

      const normalizedPaymentStatus =
        norm(
          paymentStatusFilter
        );

      const normalizedBookingType =
        norm(
          bookingTypeFilter
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
        /*
         * This entire page is for
         * In-Person sessions.
         */
        if (
          !isInPersonSession(
            item
          )
        ) {
          return false;
        }

        const bookingStatus =
          getBookingStatus(
            item
          );

        const fullText = [
          item?.studentname ||
            "",

          getMainTeacherText(
            item
          ),

          ...getGroupAssistantNames(
            item
          ),

          item?.payment_type ||
            "",

          getPaymentStatusDisplay(
            item?.payment_status
          ),

          item?.session_type ||
            "",

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

          getAmountText(
            item
          ),

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

        const matchesStatus =
          !normalizedStatus ||
          norm(
            bookingStatus
          ) ===
            normalizedStatus;

        const matchesPaymentStatus =
          !normalizedPaymentStatus ||
          norm(
            getPaymentStatusDisplay(
              item?.payment_status
            )
          ) ===
            normalizedPaymentStatus;

        const matchesBookingType =
          !normalizedBookingType ||
          norm(
            item?.booking_type
          ) ===
            normalizedBookingType;

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
          matchesStatus &&
          matchesPaymentStatus &&
          matchesBookingType &&
          matchesStartDate &&
          matchesEndDate
        );
      });
    }, [
      rows,
      searchTerm,
      bookingStatusFilter,
      paymentStatusFilter,
      bookingTypeFilter,
      startDate,
      endDate,
    ]);

  /*
   * =========================================================
   * PAGINATION
   * =========================================================
   */

  const totalPages =
    Math.ceil(
      filteredData.length /
        itemsPerPage
    ) || 1;

  const safePage =
    Math.min(
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

  /*
   * =========================================================
   * EXCEL EXPORT
   * =========================================================
   */

  const exportToExcel = () => {
    const heading = [
      [
        "Inperson Booking List",
      ],
    ];

    const data =
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
            "S.L":
              index + 1,

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
              getPaymentStatusDisplay(
                item?.payment_status
              ) || "-",

            "Session Type":
              item?.session_type ||
              "-",

            "Booking Type":
              item?.booking_type ||
              "-",

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
      XLSX.utils
        .json_to_sheet(
          data,
          {
            origin: -1,
          }
        );

    XLSX.utils
      .sheet_add_aoa(
        worksheet,
        heading,
        {
          origin: "A1",
        }
      );

    const workbook =
      XLSX.utils
        .book_new();

    XLSX.utils
      .book_append_sheet(
        workbook,
        worksheet,
        "Inperson Bookings"
      );

    XLSX.writeFile(
      workbook,
      "inperson_bookings.xlsx"
    );
  };

  /*
   * =========================================================
   * PDF EXPORT
   * =========================================================
   */

  const exportToPDF = () => {
    const document =
      new jsPDF();

    document.setFontSize(
      16
    );

    document.text(
      "Inperson Booking List",
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

            getAmountText(
              item
            ),

            item?.payment_type ||
              "-",

            getPaymentStatusDisplay(
              item?.payment_status
            ) || "-",

            item?.session_type ||
              "-",

            item?.booking_type ||
              "-",

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

    autoTable(
      document,
      {
        startY: 25,
        head: [
          columns,
        ],
        body:
          pdfRows,

        styles: {
          fontSize: 8,
        },

        headStyles: {
          fontSize: 8,
        },
      }
    );

    document.save(
      "inperson_bookings.pdf"
    );
  };

  /*
   * =========================================================
   * LOADING
   * =========================================================
   */

  if (initialLoading) {
    return (
      <div
        className="d-flex justify-content-center align-items-center"
        style={{
          height:
            "300px",
        }}
      >
        <div
          style={{
            width:
              "48px",

            height:
              "48px",

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

  /*
   * =========================================================
   * UI
   * =========================================================
   */

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
              inset 0 0 0 1px rgba(255,255,255,0.03),
              0 10px 22px rgba(0,0,0,0.2);
          }

          .lyl-select-wrap::after {
            content: "";
            position: absolute;
            right: 16px;
            top: 50%;
            width: 10px;
            height: 10px;
            border-right: 2px solid rgba(255,255,255,0.9);
            border-bottom: 2px solid rgba(255,255,255,0.9);
            transform: translateY(-65%) rotate(45deg);
            pointer-events: none;
          }

          .lyl-select:disabled {
            opacity: 0.6;
            cursor: not-allowed;
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
              0 24px 70px rgba(0,0,0,0.42),
              inset 0 0 0 1px rgba(255,255,255,0.02);
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
            box-shadow:
              0 14px 30px rgba(29, 115, 255, 0.25);
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
            box-shadow:
              0 12px 24px rgba(29, 115, 255, 0.22);
          }

          .lyl-btn-secondary {
            color: #d7e4f7;
            background: rgba(255,255,255,0.06);
            border: 1px solid rgba(255,255,255,0.08);
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
            box-shadow:
              0 18px 48px rgba(0,0,0,0.3);
            border: 1px solid rgba(255,255,255,0.08);
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
            color: rgba(255,255,255,0.88);
          }

          .lyl-cell-note {
            margin-top: 7px;
            font-size: 11px;
            color: #8aa0bf;
            font-weight: 600;
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
        alertData={
          alertData
        }
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

      <div className="card-header border-bottom bg-base py-16 px-24 d-flex align-items-center flex-wrap gap-3 justify-content-between">
        <div className="d-flex align-items-center flex-wrap gap-3">
          <input
            type="text"
            className="form-control w-auto"
            placeholder="Search"
            value={
              searchTerm
            }
            onChange={(event) =>
              setSearchTerm(
                event.target.value
              )
            }
          />

          <input
            type="date"
            className="form-control w-auto"
            value={
              startDate
            }
            onChange={(event) =>
              setStartDate(
                event.target.value
              )
            }
          />

          <input
            type="date"
            className="form-control w-auto"
            value={
              endDate
            }
            onChange={(event) =>
              setEndDate(
                event.target.value
              )
            }
          />

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

            <option value="completed">
              Completed
            </option>

            <option value="ongoing">
              Ongoing
            </option>

            <option value="missed">
              Missed
            </option>

            <option value="cancelled">
              Cancelled
            </option>
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
                (bookingType) =>
                  ![
                    "manual",
                    "web app",
                  ].includes(
                    bookingType
                  )
              )
              .map(
                (bookingType) => (
                  <option
                    key={
                      bookingType
                    }
                    value={
                      bookingType
                    }
                  >
                    {
                      bookingType
                    }
                  </option>
                )
              )}
          </select>

          <button
            type="button"
            onClick={() => {
              setSearchTerm(
                ""
              );

              setBookingStatusFilter(
                ""
              );

              setPaymentStatusFilter(
                ""
              );

              setBookingTypeFilter(
                ""
              );

              setStartDate(
                ""
              );

              setEndDate(
                ""
              );

              setCurrentPage(
                1
              );
            }}
            className="btn btn-outline-secondary btn-sm"
          >
            Reset Filters
          </button>

          <button
            type="button"
            onClick={
              exportToExcel
            }
            className="btn btn-success btn-sm"
          >
            Excel Export
          </button>

          <button
            type="button"
            onClick={
              exportToPDF
            }
            className="btn btn-danger btn-sm"
          >
            PDF Export
          </button>
        </div>
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
                refreshBookings
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
                <th>
                  S.L
                </th>

                <th>
                  Reschedule Booking
                </th>

                <th>
                  Book Date
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
              </tr>
            </thead>

            <tbody>
              {currentItems.length ===
              0 ? (
                <tr>
                  <td
                    colSpan={
                      14
                    }
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

                    const assistantNames =
                      getGroupAssistantNames(
                        item
                      );

                    /*
                     * Important:
                     * Manual Missed exception applies
                     * only to One-to-One.
                     */
                    const isManualMissed =
                      !isGroupBooking(
                        item
                      ) &&
                      isInPersonSession(
                        item
                      ) &&
                      norm(
                        item?.inperson_status_mode ||
                          "auto"
                      ) ===
                        "manual" &&
                      norm(
                        item?.inperson_status
                      ) ===
                        "missed";

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
                            className={`btn btn-sm ${
                              rescheduleDisabled
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
                                : isManualMissed
                                  ? "Missed booking can be rescheduled"
                                  : rescheduleDisabled
                                    ? "Past bookings cannot be rescheduled"
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
                          <div
                            style={{
                              display:
                                "flex",

                              gap:
                                "8px",

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
                                isFieldSaving(
                                  bookingId,
                                  "amount"
                                )
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
                                isFieldSaving(
                                  bookingId,
                                  "amount"
                                )
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

                          {isFieldSaving(
                            bookingId,
                            "amount"
                          ) ? (
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
                          <DarkSelectEditor
                            value={
                              getPaymentStatusDisplay(
                                item
                                  ?.payment_status
                              )
                            }
                            options={
                              PAYMENT_STATUS_OPTIONS
                            }
                            loading={
                              isFieldSaving(
                                bookingId,
                                "payment_status"
                              )
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

                          {isFieldSaving(
                            bookingId,
                            "payment_status"
                          ) ? (
                            <div className="lyl-cell-note">
                              Updating...
                            </div>
                          ) : null}
                        </td>

                        <td>
                          <span
                            className={`badge ${getSessionTypeBadgeClass(
                              item
                                ?.session_type
                            )}`}
                          >
                            {item
                              ?.session_type ||
                              "-"}
                          </span>
                        </td>

                        <td>
                          <span
                            className={`badge ${getBookingTypeBadgeClass(
                              item
                                ?.booking_type
                            )}`}
                          >
                            {item
                              ?.booking_type ||
                              "-"}
                          </span>
                        </td>

                        <td>
                          <span
                            className={`lyl-class-type-badge ${
                              isGroupBooking(
                                item
                              )
                                ? "group"
                                : "one-to-one"
                            }`}
                          >
                            {getBookingCategory(
                              item
                            )}
                          </span>
                        </td>

                        <td>
                          <DarkSelectEditor
                            value={
                              getInpersonDropdownValue(
                                item
                              )
                            }
                            options={
                              INPERSON_STATUS_OPTIONS
                            }
                            loading={
                              isFieldSaving(
                                bookingId,
                                "inperson_status"
                              )
                            }
                            onChange={(
                              value
                            ) =>
                              openConfirmModal(
                                item,
                                "inperson_status",
                                value
                              )
                            }
                          />

                          {isFieldSaving(
                            bookingId,
                            "inperson_status"
                          ) ? (
                            <div className="lyl-cell-note">
                              Updating...
                            </div>
                          ) : null}
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
            {filteredData.length ===
            0
              ? 0
              : indexOfFirstItem +
                1}{" "}
            to{" "}
            {Math.min(
              indexOfLastItem,
              filteredData.length
            )}{" "}
            of{" "}
            {
              filteredData.length
            }{" "}
            entries
          </span>

          <div className="d-flex align-items-center gap-2">
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              onClick={() =>
                setCurrentPage(
                  (page) =>
                    Math.max(
                      1,
                      page - 1
                    )
                )
              }
              disabled={
                safePage <= 1
              }
            >
              Previous
            </button>

            <span className="small">
              Page {safePage} of{" "}
              {totalPages}
            </span>

            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              onClick={() =>
                setCurrentPage(
                  (page) =>
                    Math.min(
                      totalPages,
                      page + 1
                    )
                )
              }
              disabled={
                safePage >=
                totalPages
              }
            >
              Next
            </button>
          </div>
        </div>
      </div>

      <RescheduleBookingModal
        key={
          selectedBooking
            ?.bookingid ||
          selectedBooking
            ?.booking_id ||
          selectedBooking?.id ||
          "reschedule"
        }
        isOpen={
          isRescheduleOpen
        }
        onClose={
          closeRescheduleModal
        }
        onSuccess={
          refreshBookings
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
    </div>
  );
};

export default InpersonBookingLayer;