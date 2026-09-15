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

const PAYMENT_STATUS_OPTIONS = [
  "Paid",
  "Unpaid",
  "Free",
];

const SESSION_TYPE_OPTIONS = [
  "Online",
  "In-Person",
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
        onClick={(event) =>
          event.stopPropagation()
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
              : confirmText || "Confirm"}
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
      className={`lyl-toast ${alertData.type === "success"
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

const DirectBookingLayer = () => {
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
    reloadNonce,
    setReloadNonce,
  ] = useState(0);

  const [
    savingMap,
    setSavingMap,
  ] = useState({});

  const [
    confirmLoading,
    setConfirmLoading,
  ] = useState(false);

  const [
    amountDraftMap,
    setAmountDraftMap,
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

  const cleanTimezone = (value) =>
    String(value || "")
      .replace(/\\\//g, "/")
      .trim();

  const getBookDateValue = (item) =>
    item?.bookdate ||
    item?.booking_date ||
    "";

  const getSlotStartValue = (item) =>
    item?.slot_start ||
    item?.booking_start_time ||
    "";

  const getSlotEndValue = (item) =>
    item?.slot_end ||
    item?.booking_end_time ||
    "";

  const getBookingId = (item) =>
    item?.bookingid ??
    item?.booking_id ??
    item?.id ??
    "";

  /*
   * Exact same Group booking rule
   * used in the All Bookings component.
   */
  const isGroupBooking = (item) =>
    Number(
      item?.is_group_booking || 0
    ) === 1;

  const getStudentTimezone = (item) => {
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

    return moment.tz.zone(timezone)
      ? timezone
      : TZ;
  };

  const parseBookingDateTime = (
    item,
    type = "start"
  ) => {
    const bookingDate =
      getBookDateValue(item);

    const bookingTime =
      type === "end"
        ? getSlotEndValue(item)
        : getSlotStartValue(item);

    if (!bookingDate) {
      return null;
    }

    const sourceTimezone =
      getStudentTimezone(item);

    const dateTimeValue = bookingTime
      ? `${bookingDate} ${bookingTime}`
      : `${bookingDate} 00:00:00`;

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

    let parsed = moment.tz(
      dateTimeValue,
      formats,
      true,
      sourceTimezone
    );

    if (!parsed.isValid()) {
      parsed = moment.tz(
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

    const bookingDate =
      getBookDateValue(item);

    if (!bookingDate) {
      return null;
    }

    const sourceTimezone =
      getStudentTimezone(item);

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

    let parsed = moment.tz(
      bookingDate,
      formats,
      true,
      sourceTimezone
    );

    if (!parsed.isValid()) {
      parsed = moment.tz(
        bookingDate,
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
      ? dateTime.format("hh:mm A")
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

  const getSessionTypeKey = (value) => {
    const type = norm(value)
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (type === "in person") {
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
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (type === "in person") {
      return "In-Person";
    }

    if (type === "online") {
      return "Online";
    }

    return "Online";
  };

  const getPaymentStatusDisplay = (
    value
  ) => {
    const status = norm(value);

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

  const getInpersonStatusDisplay = (
    value
  ) => {
    const status = norm(value);

    if (status === "upcoming") {
      return "Upcoming";
    }

    if (status === "ongoing") {
      return "Ongoing";
    }

    if (status === "completed") {
      return "Completed";
    }

    if (status === "cancelled") {
      return "Cancelled";
    }

    if (status === "missed") {
      return "Missed";
    }

    return "";
  };

  const isInPersonSession = (item) =>
    getSessionTypeKey(
      item?.session_type
    ) === "in-person";

  const normalizeRecordingUrl = (
    value
  ) =>
    String(value || "")
      .replace(/\\\//g, "/")
      .trim();

  const hasRecordingUrl = (item) =>
    Boolean(
      normalizeRecordingUrl(
        item?.recording_s3_url
      )
    );

  const openRecording = (item) => {
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

    setIsRecordingOpen(true);
  };

  const closeRecording = () => {
    setIsRecordingOpen(false);
    setActiveRecordingUrl("");
  };

  const openRescheduleModal = (
    item
  ) => {
    setSelectedBooking(item);
    setIsRescheduleOpen(true);
  };

  const closeRescheduleModal = () => {
    setIsRescheduleOpen(false);
    setSelectedBooking(null);
  };

  const refreshBookings = () => {
    setReloadNonce(
      (previous) => previous + 1
    );
  };

  const getNow = () =>
    moment.tz(TZ);

  const getBookingStatus = (item) => {
    const inpersonDatabaseStatus =
      getInpersonStatusDisplay(
        item?.inperson_status
      );

    if (
      isInPersonSession(item) &&
      inpersonDatabaseStatus
    ) {
      return norm(
        inpersonDatabaseStatus
      );
    }

    const now = getNow();

    const bookingDate =
      getBookDateValue(item);

    const slotStart =
      getSlotStartValue(item);

    const slotEnd =
      getSlotEndValue(item);

    const hasRecording =
      hasRecordingUrl(item);

    const inPerson =
      isInPersonSession(item);

    if (!bookingDate) {
      return "upcoming";
    }

    const startDateTime = slotStart
      ? parseBookingDateTime(
        item,
        "start"
      )
      : null;

    const endDateTime = slotEnd
      ? parseBookingDateTime(
        item,
        "end"
      )
      : null;

    if (endDateTime) {
      if (now.isAfter(endDateTime)) {
        if (inPerson) {
          return "completed";
        }

        const teacherFeedbackDone =
          Number(
            item?.has_teacher_feedback ||
            0
          ) === 1;

        return hasRecording ||
          teacherFeedbackDone
          ? "completed"
          : "missed";
      }

      if (
        startDateTime &&
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

    const endOfDay =
      parseBookingDateTime(
        {
          ...item,
          slot_end: "23:59:59",
        },
        "end"
      );

    if (
      endOfDay &&
      now.isAfter(endOfDay)
    ) {
      if (inPerson) {
        return "completed";
      }

      const teacherFeedbackDone =
        Number(
          item?.has_teacher_feedback ||
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
    const status =
      getBookingStatus(item);

    if (
      [
        "missed",
        "completed",
        "cancelled",
      ].includes(norm(status))
    ) {
      return true;
    }

    const bookingDate =
      getBookDateValue(item);

    const slotStart =
      getSlotStartValue(item);

    if (!bookingDate) {
      return false;
    }

    const now = getNow();

    const startDateTime = slotStart
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

    const dubaiBookingDate =
      getDubaiBookDateMoment(item);

    if (!dubaiBookingDate) {
      return false;
    }

    return dubaiBookingDate.isBefore(
      now,
      "day"
    );
  };

  const getBookingStatusBadgeClass = (
    status
  ) => {
    const normalizedStatus =
      norm(status);

    if (
      normalizedStatus === "completed"
    ) {
      return "bg-success";
    }

    if (
      normalizedStatus === "ongoing"
    ) {
      return "bg-info";
    }

    if (
      normalizedStatus === "missed"
    ) {
      return "bg-danger";
    }

    if (
      normalizedStatus === "cancelled"
    ) {
      return "bg-danger";
    }

    return "bg-warning text-dark";
  };

  const getPaymentTypeBadgeClass = (
    type
  ) => {
    const normalizedType = norm(type);

    if (normalizedType === "direct") {
      return "bg-success";
    }

    return "bg-secondary";
  };

  const getBookingTypeBadgeClass = (
    type
  ) => {
    const normalizedType = norm(type);

    if (normalizedType === "manual") {
      return "bg-primary";
    }

    if (
      normalizedType === "web app"
    ) {
      return "bg-success";
    }

    return "bg-secondary";
  };

  const getAmountValue = (item) => {
    const rawAmount =
      item?.booking_amount ??
      item?.amount ??
      0;

    const amount = Number(
      String(rawAmount ?? "0")
        .replace(/,/g, "")
        .trim()
    );

    return Number.isFinite(amount)
      ? amount
      : 0;
  };

  const getAmountText = (item) =>
    `AED ${getAmountValue(
      item
    ).toFixed(2)}`;

  const makeRowKey = (item) => {
    const bookingId =
      item?.bookingid ??
      item?.booking_id ??
      item?.id ??
      "na";

    const bookingDate =
      getBookDateValue(item) || "na";

    const slotStart =
      getSlotStartValue(item) ||
      "na";

    const slotEnd =
      getSlotEndValue(item) || "na";

    const teacherName =
      item?.teachername ?? "na";

    const studentName =
      item?.studentname ?? "na";

    const studentId =
      item?.studentid ?? "na";

    return [
      bookingId,
      bookingDate,
      slotStart,
      slotEnd,
      teacherName,
      studentName,
      studentId,
    ].join("|");
  };

  const dedupeBookings = (list) => {
    const seen = new Set();
    const output = [];

    for (const item of list || []) {
      const key = makeRowKey(item);

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      output.push(item);
    }

    return output;
  };

  const getTokenValue = async () => {
    const tokenResponse =
      await getToken();

    if (
      typeof tokenResponse === "string"
    ) {
      return tokenResponse;
    }

    if (
      typeof tokenResponse?.token ===
      "string"
    ) {
      return tokenResponse.token;
    }

    if (
      typeof tokenResponse?.data
        ?.token === "string"
    ) {
      return tokenResponse.data.token;
    }

    if (
      typeof tokenResponse?.data?.data
        ?.token === "string"
    ) {
      return tokenResponse.data.data
        .token;
    }

    return "";
  };

  const setFieldSaving = (
    bookingId,
    field,
    isSaving
  ) => {
    const key = `${bookingId}_${field}`;

    setSavingMap((previous) => ({
      ...previous,
      [key]: isSaving,
    }));
  };

  const isFieldSaving = (
    bookingId,
    field
  ) => {
    const key = `${bookingId}_${field}`;
    return Boolean(savingMap[key]);
  };

  const patchRow = (
    bookingId,
    patch
  ) => {
    setRows((previous) =>
      previous.map((row) =>
        String(getBookingId(row)) ===
          String(bookingId)
          ? {
            ...row,
            ...patch,
          }
          : row
      )
    );
  };

  const updateDynamicBookingData =
    async (item, updates = {}) => {
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

      const conditionId = /^\d+$/.test(
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
        Object.keys(updateData).length ===
        0
      ) {
        throw new Error(
          "Update data not found."
        );
      }

      const payload = {
        token,
        tablename: "bookteacher",
        conditions: [
          {
            id: conditionId,
          },
        ],
        updatedata: [updateData],
      };

      const response = await axios.post(
        UPDATE_DYNAMIC_DATA_URL,
        payload,
        {
          headers: API_HEADERS,
        }
      );

      if (
        response?.data?.statusCode !==
        200
      ) {
        throw new Error(
          response?.data?.message ||
          "Update failed"
        );
      }

      return response.data;
    };

  const openConfirmModal = (
    item,
    field,
    newValue
  ) => {
    if (field === "payment_status") {
      const currentValue =
        getPaymentStatusDisplay(
          item?.payment_status
        );

      if (currentValue === newValue) {
        return;
      }

      setConfirmModal({
        open: true,
        item,
        field,
        newValue,
        title: "Update Payment Status",
        message: `Are you sure you want to change payment status from "${currentValue}" to "${newValue}"?`,
      });

      return;
    }

    if (field === "session_type") {
      const currentValue =
        getSessionTypeDisplay(
          item?.session_type
        );

      if (currentValue === newValue) {
        return;
      }

      setConfirmModal({
        open: true,
        item,
        field,
        newValue,
        title: "Update Session Type",
        message: `Are you sure you want to change session type from "${currentValue}" to "${newValue}"?`,
      });

      return;
    }

    if (field === "amount") {
      const currentValue =
        getAmountValue(item);

      const nextValue = Number(
        String(newValue ?? "0")
          .replace(/,/g, "")
          .trim()
      );

      if (
        !Number.isFinite(nextValue) ||
        nextValue < 0
      ) {
        showAlert(
          "error",
          "Invalid Amount",
          "Please enter a valid amount."
        );

        return;
      }

      if (currentValue === nextValue) {
        return;
      }

      setConfirmModal({
        open: true,
        item,
        field,
        newValue: nextValue,
        title: "Update Amount",
        message: `Are you sure you want to change amount from "AED ${currentValue.toFixed(
          2
        )}" to "AED ${nextValue.toFixed(
          2
        )}"?`,
      });
    }
  };

  const closeConfirmModal = () => {
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
          "Booking ID not found."
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
        field === "payment_status"
          ? getPaymentStatusDisplay(
            item?.payment_status
          )
          : field === "session_type"
            ? getSessionTypeDisplay(
              item?.session_type
            )
            : getAmountValue(item);

      const optimisticPatch =
        field === "payment_status"
          ? {
            payment_status: newValue,
          }
          : field === "session_type"
            ? {
              session_type: newValue,
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
          field === "payment_status"
            ? {
              payment_status:
                newValue,
            }
            : field === "session_type"
              ? {
                sessionType: newValue,
              }
              : {
                amount: newValue,
              }
        );

        if (field === "amount") {
          setAmountDraftMap(
            (previous) => ({
              ...previous,
              [bookingId]: newValue,
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
        patchRow(
          bookingId,
          field === "payment_status"
            ? {
              payment_status:
                previousValue,
            }
            : field === "session_type"
              ? {
                session_type:
                  previousValue,
              }
              : {
                booking_amount:
                  previousValue,
              }
        );

        if (field === "amount") {
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
        setConfirmLoading(false);

        setFieldSaving(
          bookingId,
          field,
          false
        );
      }
    };

  useEffect(() => {
    let active = true;

    const fetchData = async () => {
      setInitialLoading(true);
      setLoadError("");

      try {
        const response =
          await getAllBookings();

        const rawRows =
          Array.isArray(response)
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

        /*
         * Do not pre-filter the API result.
         * Keep all API rows in state.
         */
        const dedupedRows =
          dedupeBookings(rawRows);

        const sortedRows = dedupedRows
          .slice()
          .sort((first, second) => {
            const firstDate =
              getDubaiBookDateMoment(
                first
              );

            const secondDate =
              getDubaiBookDateMoment(
                second
              );

            return (
              (secondDate?.valueOf?.() ||
                0) -
              (firstDate?.valueOf?.() ||
                0)
            );
          });

        if (!active) {
          return;
        }

        setRows(sortedRows);
      } catch (error) {
        if (!active) {
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
        if (active) {
          setInitialLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      active = false;
    };
  }, [reloadNonce]);

  useEffect(() => {
    setCurrentPage(1);
  }, [
    searchTerm,
    bookingStatusFilter,
    paymentStatusFilter,
    sessionTypeFilter,
    bookingTypeFilter,
    startDate,
    endDate,
  ]);

  const filteredData = useMemo(() => {
    const normalizedSearch =
      norm(searchTerm);

    const normalizedBookingStatus =
      norm(bookingStatusFilter);

    const normalizedPaymentStatus =
      norm(paymentStatusFilter);

    const normalizedSessionType =
      getSessionTypeKey(
        sessionTypeFilter
      );

    const normalizedBookingType =
      norm(bookingTypeFilter);

    const startMoment = startDate
      ? moment.tz(
        startDate,
        "YYYY-MM-DD",
        true,
        TZ
      )
      : null;

    const endMoment = endDate
      ? moment.tz(
        endDate,
        "YYYY-MM-DD",
        true,
        TZ
      )
      : null;

    return (rows || []).filter(
      (item) => {
        /*
         * Only hide rows where
         * is_group_booking is exactly 1.
         */
        if (isGroupBooking(item)) {
          return false;
        }

        /*
         * Direct Booking page:
         * only payment_type = direct.
         */
        if (
          norm(item?.payment_type) !==
          "direct"
        ) {
          return false;
        }

        const bookingStatus =
          getBookingStatus(item);

        const completeSearchText = [
          item?.studentname || "",
          item?.teachername || "",
          item?.payment_type || "",
          getPaymentStatusDisplay(
            item?.payment_status
          ),
          getSessionTypeDisplay(
            item?.session_type
          ),
          item?.booking_type || "",
          getAmountText(item),
          bookingStatus,
          getBookDateValue(item),
          getSlotStartValue(item),
          getSlotEndValue(item),
        ]
          .join(" ")
          .toLowerCase();

        const matchesSearch =
          !normalizedSearch ||
          completeSearchText.includes(
            normalizedSearch
          );

        const matchesBookingStatus =
          !normalizedBookingStatus ||
          norm(bookingStatus) ===
          normalizedBookingStatus;

        const matchesPaymentStatus =
          !normalizedPaymentStatus ||
          norm(
            getPaymentStatusDisplay(
              item?.payment_status
            )
          ) ===
          normalizedPaymentStatus;

        const matchesSessionType =
          !normalizedSessionType ||
          getSessionTypeKey(
            item?.session_type
          ) === normalizedSessionType;

        const matchesBookingType =
          !normalizedBookingType ||
          norm(item?.booking_type) ===
          normalizedBookingType;

        const itemDate =
          getDubaiBookDateMoment(item);

        const matchesStartDate =
          startMoment
            ? itemDate
              ? itemDate.isSameOrAfter(
                startMoment,
                "day"
              )
              : false
            : true;

        const matchesEndDate = endMoment
          ? itemDate
            ? itemDate.isSameOrBefore(
              endMoment,
              "day"
            )
            : false
          : true;

        return (
          matchesSearch &&
          matchesBookingStatus &&
          matchesPaymentStatus &&
          matchesSessionType &&
          matchesBookingType &&
          matchesStartDate &&
          matchesEndDate
        );
      }
    );
  }, [
    rows,
    searchTerm,
    bookingStatusFilter,
    paymentStatusFilter,
    sessionTypeFilter,
    bookingTypeFilter,
    startDate,
    endDate,
  ]);

  const totalPages =
    Math.ceil(
      filteredData.length /
      itemsPerPage
    ) || 1;

  const safePage = Math.min(
    Math.max(currentPage, 1),
    totalPages
  );

  const indexOfLastItem =
    safePage * itemsPerPage;

  const indexOfFirstItem =
    indexOfLastItem - itemsPerPage;

  const currentItems =
    filteredData.slice(
      indexOfFirstItem,
      indexOfLastItem
    );

  useEffect(() => {
    if (currentPage !== safePage) {
      setCurrentPage(safePage);
    }
  }, [safePage, currentPage]);

  const exportToExcel = () => {
    const heading = [
      ["Direct Booking List"],
    ];

    const exportRows = filteredData.map(
      (item, index) => {
        const status =
          getBookingStatus(item);

        const bookingDate =
          getDubaiBookDateMoment(item);

        return {
          "S.L": index + 1,
          "Book Date": bookingDate
            ? bookingDate.format(
              "DD MMM YYYY"
            )
            : "-",
          "Student Name":
            item?.studentname || "-",
          "Booked Teacher":
            item?.teachername || "-",
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
          Amount: getAmountText(item),
          "Payment Type":
            item?.payment_type || "-",
          "Payment Status":
            getPaymentStatusDisplay(
              item?.payment_status
            ) || "-",
          "Session Type":
            getSessionTypeDisplay(
              item?.session_type
            ) || "-",
          "Booking Type":
            item?.booking_type || "-",
          Status: status
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
        exportRows,
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
      "Direct Bookings"
    );

    XLSX.writeFile(
      workbook,
      "direct_bookings.xlsx"
    );
  };

  const exportToPDF = () => {
    const document = new jsPDF();

    document.setFontSize(16);

    document.text(
      "Direct Booking List",
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
      "Status",
    ];

    const pdfRows = filteredData.map(
      (item, index) => {
        const status =
          getBookingStatus(item);

        const bookingDate =
          getDubaiBookDateMoment(item);

        return [
          index + 1,
          bookingDate
            ? bookingDate.format(
              "DD MMM YYYY"
            )
            : "-",
          item?.studentname || "-",
          item?.teachername || "-",
          formatDubaiBookingTime(
            item,
            "start"
          ),
          formatDubaiBookingTime(
            item,
            "end"
          ),
          getAmountText(item),
          item?.payment_type || "-",
          getPaymentStatusDisplay(
            item?.payment_status
          ) || "-",
          getSessionTypeDisplay(
            item?.session_type
          ) || "-",
          item?.booking_type || "-",
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
      "direct_bookings.pdf"
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
            borderRadius: "50%",
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

          .lyl-no-recording {
            display: inline-flex;
            padding: 6px 9px;
            border-radius: 999px;
            color: #dc2626;
            background: rgba(220, 38, 38, 0.1);
            font-size: 10px;
            font-weight: 700;
            white-space: nowrap;
          }

          @media (max-width: 480px) {
            .lyl-modal-actions {
              flex-direction: column-reverse;
            }

            .lyl-modal-actions .lyl-btn {
              width: 100%;
              min-width: 100%;
            }

            .lyl-toast {
              left: 14px;
              right: 14px;
              min-width: 0;
              max-width: none;
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
        open={confirmModal.open}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText="Yes, Update"
        cancelText="Cancel"
        onConfirm={handleConfirmUpdate}
        onClose={closeConfirmModal}
        loading={confirmLoading}
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
            value={bookingStatusFilter}
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
            value={paymentStatusFilter}
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
            value={sessionTypeFilter}
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
          </select>

          <select
            className="form-select form-select-sm w-auto"
            value={bookingTypeFilter}
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
          </select>

          <button
            type="button"
            className="btn btn-outline-secondary btn-sm"
            onClick={() => {
              setSearchTerm("");
              setBookingStatusFilter("");
              setPaymentStatusFilter("");
              setSessionTypeFilter("");
              setBookingTypeFilter("");
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
            onClick={exportToExcel}
          >
            Excel Export
          </button>

          <button
            type="button"
            className="btn btn-danger btn-sm"
            onClick={exportToPDF}
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
              onClick={refreshBookings}
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
          All booking dates and times are
          shown in Asia/Dubai timezone.
        </div>

        <div className="table-responsive">
          <table className="table bordered-table sm-table mb-0">
            <thead>
              <tr>
                <th>S.L</th>
                <th>
                  Reschedule Booking
                </th>
                <th>Book Date</th>
                <th>Recording</th>
                <th>Student Name</th>
                <th>Teacher Name</th>
                <th>Slot Start</th>
                <th>Slot End</th>
                <th>Amount</th>
                <th>Payment Type</th>
                <th>Payment Status</th>
                <th>Session Type</th>
                <th>Booking Type</th>
                <th>Status</th>
              </tr>
            </thead>

            <tbody>
              {currentItems.length === 0 ? (
                <tr>
                  <td
                    colSpan={14}
                    className="text-center"
                  >
                    No records found.
                  </td>
                </tr>
              ) : (
                currentItems.map(
                  (item, index) => {
                    const status =
                      getBookingStatus(item);

                    const recordingUrl =
                      normalizeRecordingUrl(
                        item?.recording_s3_url
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
                      getBookingId(item);

                    return (
                      <tr
                        key={makeRowKey(
                          item
                        )}
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
                            disabled={
                              rescheduleDisabled
                            }
                            onClick={() => {
                              if (
                                !rescheduleDisabled
                              ) {
                                openRescheduleModal(
                                  item
                                );
                              }
                            }}
                            title={
                              rescheduleDisabled
                                ? "This booking cannot be rescheduled after the session start time"
                                : "Reschedule booking"
                            }
                            style={{
                              minWidth:
                                "110px",
                              borderRadius:
                                "8px",
                              fontWeight: 600,
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
                          ) : norm(status) ===
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
                          {item?.teachername ||
                            "-"}
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
                              display: "flex",
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
                                width: "110px",
                              }}
                              value={
                                amountDraftMap[
                                bookingId
                                ] ??
                                getAmountValue(
                                  item
                                )
                              }
                              disabled={isFieldSaving(
                                bookingId,
                                "amount"
                              )}
                              onChange={(
                                event
                              ) => {
                                const value =
                                  event.target
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
                              disabled={isFieldSaving(
                                bookingId,
                                "amount"
                              )}
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
                              item?.payment_type
                            )}`}
                          >
                            {item?.payment_type ||
                              "-"}
                          </span>
                        </td>

                        <td>
                          <DarkSelectEditor
                            value={getPaymentStatusDisplay(
                              item?.payment_status
                            )}
                            options={
                              PAYMENT_STATUS_OPTIONS
                            }
                            loading={isFieldSaving(
                              bookingId,
                              "payment_status"
                            )}
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
                        </td>

                        <td>
                          <DarkSelectEditor
                            value={getSessionTypeDisplay(
                              item?.session_type
                            )}
                            options={
                              SESSION_TYPE_OPTIONS
                            }
                            loading={isFieldSaving(
                              bookingId,
                              "session_type"
                            )}
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
                        </td>

                        <td>
                          <span
                            className={`badge ${getBookingTypeBadgeClass(
                              item?.booking_type
                            )}`}
                          >
                            {item?.booking_type ||
                              "-"}
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
                              status.slice(1)
                              : "-"}
                          </span>
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
            of {filteredData.length}{" "}
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
          onClick={closeRecording}
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
                onClick={closeRecording}
              >
                Close
              </button>
            </div>

            {activeRecordingUrl ? (
              <video
                src={activeRecordingUrl}
                controls
                autoPlay
                style={{
                  width: "100%",
                  maxHeight: "70vh",
                  background: "#000000",
                  borderRadius: "12px",
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
          selectedBooking?.bookingid ||
          selectedBooking?.booking_id ||
          selectedBooking?.id ||
          "reschedule"
        }
        isOpen={isRescheduleOpen}
        onClose={closeRescheduleModal}
        onSuccess={refreshBookings}
        booking={selectedBooking}
        timezone={
          cleanTimezone(
            selectedBooking
              ?.studentTime_zone
          ) || TZ
        }
      />
    </div>
  );
};

export default DirectBookingLayer;