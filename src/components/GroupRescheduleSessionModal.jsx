import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import axios from "axios";
import moment from "moment-timezone";
import { Icon } from "@iconify/react/dist/iconify.js";
import { getToken } from "../api/getToken";

const ADMIN_TIMEZONE = "Asia/Dubai";

const GROUP_RESCHEDULE_URL =
  "https://api.learnyourlanguage.org/RestController_Thirdparty.php?view=reschedule_group_live_session";

const API_HEADERS = {
  projectid: "1",
  userid: "test",
  password: "test",
  "x-api-key": "abc123456789",
  "Content-Type": "application/json",
};

const resolveToken = (tokenResponse) => {
  if (typeof tokenResponse === "string") {
    return tokenResponse;
  }

  return (
    tokenResponse?.token ||
    tokenResponse?.data?.token ||
    tokenResponse?.data?.data?.token ||
    tokenResponse?.access_token ||
    tokenResponse?.data?.access_token ||
    ""
  );
};

const asMoment = (value, timezone) =>
  moment.isMoment(value) && value.isValid()
    ? value.clone().tz(timezone)
    : null;

const parseEndDateTime = (
  session,
  startMoment,
  timezone
) => {
  const rawEnd = asMoment(
    session?.rawEndDate,
    timezone
  );

  if (rawEnd) {
    if (
      startMoment &&
      rawEnd.isSameOrBefore(startMoment)
    ) {
      rawEnd.add(1, "day");
    }

    return rawEnd;
  }

  if (!startMoment) {
    return null;
  }

  const endTime = String(
    session?.endTime || ""
  ).trim();

  if (!endTime || endTime === "-") {
    return null;
  }

  const parsed = moment.tz(
    `${startMoment.format("YYYY-MM-DD")} ${endTime}`,
    [
      "YYYY-MM-DD hh:mm A",
      "YYYY-MM-DD HH:mm",
      "YYYY-MM-DD HH:mm:ss",
    ],
    true,
    timezone
  );

  if (!parsed.isValid()) {
    return null;
  }

  if (parsed.isSameOrBefore(startMoment)) {
    parsed.add(1, "day");
  }

  return parsed;
};

const modalStyles = `
  .group-reschedule-modal-theme .theme-native-control,
  .group-reschedule-modal-theme .theme-native-control.form-control {
    background-color: var(--bs-body-bg) !important;
    color: var(--bs-emphasis-color) !important;
    border: 1px solid var(--bs-border-color) !important;
  }

  .group-reschedule-modal-theme .theme-native-control:focus {
    border-color: var(--bs-primary) !important;
    box-shadow: 0 0 0 0.15rem rgba(var(--bs-primary-rgb), 0.12) !important;
  }

  .group-reschedule-modal-theme .modal-action-btn {
    transition: all 0.2s ease;
  }

  .group-reschedule-modal-theme .modal-action-btn:hover:not(:disabled) {
    transform: translateY(-1px);
  }
`;

const GroupRescheduleSessionModal = ({
  isOpen,
  onClose,
  onSuccess,
  session,
  programme,
  batch,
}) => {
  const submitLockRef = useRef(false);

  const [newDate, setNewDate] = useState("");
  const [newStartTime, setNewStartTime] = useState("");
  const [newEndTime, setNewEndTime] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const currentStart = useMemo(
    () =>
      asMoment(
        session?.rawDate,
        ADMIN_TIMEZONE
      ),
    [session]
  );

  const currentEnd = useMemo(
    () =>
      parseEndDateTime(
        session,
        currentStart,
        ADMIN_TIMEZONE
      ),
    [
      session,
      currentStart,
    ]
  );

  const todayForAdmin = useMemo(
    () =>
      moment
        .tz(ADMIN_TIMEZONE)
        .startOf("day"),
    []
  );

  useEffect(() => {
    if (!isOpen || !session) {
      return;
    }

    setNewDate(
      currentStart?.format("YYYY-MM-DD") || ""
    );

    setNewStartTime(
      currentStart?.format("HH:mm") || ""
    );

    setNewEndTime(
      currentEnd?.format("HH:mm") || ""
    );

    setSubmitting(false);
    setSubmitError("");
    submitLockRef.current = false;
  }, [
    isOpen,
    session,
    currentStart,
    currentEnd,
  ]);

  const updatedStart = useMemo(() => {
    if (!newDate || !newStartTime) {
      return null;
    }

    const parsed = moment.tz(
      `${newDate} ${newStartTime}`,
      "YYYY-MM-DD HH:mm",
      true,
      ADMIN_TIMEZONE
    );

    return parsed.isValid() ? parsed : null;
  }, [
    newDate,
    newStartTime,
  ]);

  const updatedEnd = useMemo(() => {
    if (!newDate || !newEndTime) {
      return null;
    }

    const parsed = moment.tz(
      `${newDate} ${newEndTime}`,
      "YYYY-MM-DD HH:mm",
      true,
      ADMIN_TIMEZONE
    );

    return parsed.isValid() ? parsed : null;
  }, [
    newDate,
    newEndTime,
  ]);

  const isChanged = Boolean(
    currentStart &&
      currentEnd &&
      updatedStart &&
      updatedEnd &&
      (
        !updatedStart.isSame(currentStart) ||
        !updatedEnd.isSame(currentEnd)
      )
  );

  const canSubmit = Boolean(
    !submitting &&
      Number(session?.id) > 0 &&
      updatedStart &&
      updatedEnd &&
      updatedEnd.isAfter(updatedStart) &&
      updatedStart.isSameOrAfter(
        todayForAdmin,
        "day"
      ) &&
      isChanged
  );

  const closeSafely = () => {
    if (!submitting && !submitLockRef.current) {
      onClose?.();
    }
  };

  const handleSubmit = async () => {
    setSubmitError("");

    if (!updatedStart || !updatedEnd) {
      setSubmitError(
        "Please select a valid date, start time and end time."
      );
      return;
    }

    if (!updatedEnd.isAfter(updatedStart)) {
      setSubmitError(
        "End time must be after start time."
      );
      return;
    }

    if (
      updatedStart.isBefore(
        todayForAdmin,
        "day"
      )
    ) {
      setSubmitError(
        "A group session cannot be moved to a past date."
      );
      return;
    }

    if (!isChanged) {
      setSubmitError(
        "Please change the date or time before rescheduling."
      );
      return;
    }

    submitLockRef.current = true;
    setSubmitting(true);

    try {
      const tokenResponse = await getToken();
      const token = resolveToken(tokenResponse);

      if (!token) {
        throw new Error(
          "API token could not be generated."
        );
      }

      const response = await axios.post(
        GROUP_RESCHEDULE_URL,
        {
          groupLiveSessionId: Number(session.id),
          newDate: updatedStart.format("YYYY-MM-DD"),
          newStartTime: updatedStart.format("HH:mm"),
          newEndTime: updatedEnd.format("HH:mm"),
        },
        {
          headers: {
            ...API_HEADERS,
            token,
          },
        }
      );

      const result = response?.data || {};

      if (Number(result?.statusCode) !== 200) {
        throw new Error(
          result?.message ||
            result?.error ||
            "The group session could not be rescheduled."
        );
      }

      await onSuccess?.(result);
      onClose?.();
    } catch (error) {
      console.error(
        "Group reschedule submission failed:",
        error
      );

      setSubmitError(
        error?.response?.data?.message ||
          error?.response?.data?.error ||
          error?.message ||
          "The group session could not be rescheduled. Please try again."
      );
    } finally {
      setSubmitting(false);
      submitLockRef.current = false;
    }
  };

  if (!isOpen || !session) {
    return null;
  }

  const theme = {
    overlay: "rgba(15, 23, 42, 0.52)",
    modalBg: "var(--bs-body-bg)",
    sectionBg: "var(--bs-tertiary-bg)",
    softBg: "var(--bs-secondary-bg)",
    border: "var(--bs-border-color)",
    text: "var(--bs-body-color)",
    muted: "var(--bs-secondary-color)",
    heading: "var(--bs-emphasis-color)",
    primary: "var(--bs-primary)",
    primarySubtle: "var(--bs-primary-bg-subtle)",
    dangerBg: "var(--bs-danger-bg-subtle)",
    dangerText: "var(--bs-danger-text-emphasis)",
    dangerBorder: "var(--bs-danger-border-subtle)",
    shadow: "0 18px 48px rgba(2, 6, 23, 0.18)",
  };

  const sectionStyle = {
    border: `1px solid ${theme.border}`,
    borderRadius: "12px",
    background: theme.sectionBg,
    padding: "16px",
  };

  const fieldStyle = {
    height: "42px",
    borderRadius: "8px",
    fontSize: "13px",
    fontWeight: 600,
  };

  const teacherNames = (session.mainTeachers || [])
    .map((teacher) => teacher?.name)
    .filter(Boolean)
    .join(", ") || "Teacher not available";

  const sessionType = String(
    session?.sessionType || "Online"
  ).trim() || "Online";

  return (
    <div
      className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center group-reschedule-modal-theme"
      style={{
        background: theme.overlay,
        zIndex: 2200,
        padding: "16px",
      }}
      onClick={closeSafely}
    >
      <style>{modalStyles}</style>

      <div
        className="group-reschedule-modal"
        style={{
          width: "min(780px, 98vw)",
          maxHeight: "94vh",
          overflowY: "auto",
          background: theme.modalBg,
          borderRadius: "18px",
          boxShadow: theme.shadow,
          padding: "22px",
          border: `1px solid ${theme.border}`,
          color: theme.text,
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          className="d-flex justify-content-between align-items-center pb-3 mb-3"
          style={{
            borderBottom: `1px solid ${theme.border}`,
          }}
        >
          <div>
            <h4
              className="mb-1"
              style={{
                fontSize: "18px",
                fontWeight: 700,
                color: theme.heading,
              }}
            >
              Reschedule Group Session
            </h4>

            <div
              style={{
                fontSize: "12px",
                color: theme.muted,
              }}
            >
              Changes apply to all enrolled students.
            </div>
          </div>

          <button
            type="button"
            className="btn btn-sm"
            onClick={closeSafely}
            disabled={submitting}
            style={{
              border: "none",
              background: "transparent",
              fontSize: "22px",
              color: theme.muted,
              boxShadow: "none",
            }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {submitError ? (
          <div className="alert alert-danger py-2 mb-3">
            {submitError}
          </div>
        ) : null}

        <div className="mb-3" style={sectionStyle}>
          <h6
            style={{
              fontSize: "14px",
              fontWeight: 700,
              color: theme.heading,
              marginBottom: "14px",
            }}
          >
            Current Session Details
          </h6>

          <div className="row g-3">
            <div className="col-md-6">
              <div className="mb-3">
                <div style={{ fontSize: "12px", color: theme.muted }}>
                  Programme
                </div>
                <div style={{ fontWeight: 700, color: theme.heading }}>
                  {programme?.name || "Group Programme"}
                </div>
              </div>

              <div className="mb-3">
                <div style={{ fontSize: "12px", color: theme.muted }}>
                  Session and Subject
                </div>
                <div style={{ fontWeight: 700, color: theme.heading }}>
                  {session.title || "Group Session"}
                </div>
                <div style={{ fontSize: "12px", color: theme.muted }}>
                  {session.subject || "-"}
                </div>
              </div>

              <div className="mb-3">
                <div style={{ fontSize: "12px", color: theme.muted }}>
                  Session Type
                </div>
                <div style={{ fontWeight: 700, color: theme.heading }}>
                  {sessionType}
                </div>
              </div>

              <div>
                <div style={{ fontSize: "12px", color: theme.muted }}>
                  Batch
                </div>
                <div style={{ fontWeight: 700, color: theme.heading }}>
                  {batch?.label || "-"}
                </div>
              </div>
            </div>

            <div className="col-md-6">
              <div className="mb-3">
                <div style={{ fontSize: "12px", color: theme.muted }}>
                  Main Teacher
                </div>
                <div style={{ fontWeight: 700, color: theme.heading }}>
                  {teacherNames}
                </div>
              </div>

              <div className="mb-3">
                <div style={{ fontSize: "12px", color: theme.muted }}>
                  Current Date and Time
                </div>
                <div style={{ fontWeight: 700, color: theme.heading }}>
                  {currentStart?.format("DD MMM YYYY") || "-"}
                </div>
                <div style={{ fontSize: "13px", color: theme.muted }}>
                  {currentStart?.format("hh:mm A") || "-"} - {currentEnd?.format("hh:mm A") || "-"}
                </div>
              </div>

              <div>
                <div style={{ fontSize: "12px", color: theme.muted }}>
                  Enrolled Students
                </div>
                <div style={{ fontWeight: 700, color: theme.heading }}>
                  {session.students?.length || 0} students
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mb-3" style={sectionStyle}>
          <div className="d-flex align-items-start justify-content-between gap-3 mb-3">
            <h6
              className="mb-0"
              style={{
                fontSize: "14px",
                fontWeight: 700,
                color: theme.heading,
              }}
            >
              New Session Details
            </h6>

            <span
              style={{
                fontSize: "11px",
                fontWeight: 700,
                color: theme.muted,
                textAlign: "right",
              }}
            >
              Admin Time Zone: Asia/Dubai (UAE Time)
            </span>
          </div>

          <div className="row g-3">
            <div className="col-md-4">
              <label className="form-label" style={{ fontSize: "12px", fontWeight: 700, color: theme.muted }}>
                New Date
              </label>
              <input
                type="date"
                min={todayForAdmin.format("YYYY-MM-DD")}
                className="form-control theme-native-control"
                value={newDate}
                disabled={submitting}
                onChange={(event) => {
                  setNewDate(event.target.value);
                  setSubmitError("");
                }}
                style={fieldStyle}
              />
            </div>

            <div className="col-md-4">
              <label className="form-label" style={{ fontSize: "12px", fontWeight: 700, color: theme.muted }}>
                New Start Time
              </label>
              <input
                type="time"
                className="form-control theme-native-control"
                value={newStartTime}
                disabled={submitting}
                onChange={(event) => {
                  setNewStartTime(event.target.value);
                  setSubmitError("");
                }}
                style={fieldStyle}
              />
            </div>

            <div className="col-md-4">
              <label className="form-label" style={{ fontSize: "12px", fontWeight: 700, color: theme.muted }}>
                New End Time
              </label>
              <input
                type="time"
                className="form-control theme-native-control"
                value={newEndTime}
                disabled={submitting}
                onChange={(event) => {
                  setNewEndTime(event.target.value);
                  setSubmitError("");
                }}
                style={fieldStyle}
              />
            </div>
          </div>

          <div
            className="mt-3 d-flex gap-2 align-items-start"
            style={{
              background: theme.primarySubtle,
              borderRadius: "9px",
              padding: "11px 12px",
              fontSize: "12px",
              color: theme.heading,
              lineHeight: 1.5,
            }}
          >
            <Icon icon="solar:info-circle-linear" width="18" />
            <span>
              All booking dates and times are shown in Asia/Dubai timezone.
            </span>
          </div>
        </div>

        <div className="d-flex justify-content-between gap-3 flex-wrap">
          <button
            type="button"
            className="btn modal-action-btn"
            onClick={closeSafely}
            disabled={submitting}
            style={{
              flex: 1,
              minWidth: "180px",
              height: "42px",
              borderRadius: "999px",
              background: theme.softBg,
              color: theme.text,
              fontWeight: 700,
              border: `1px solid ${theme.border}`,
              fontSize: "13px",
            }}
          >
            Cancel
          </button>

          <button
            type="button"
            className="btn modal-action-btn"
            onClick={handleSubmit}
            disabled={!canSubmit}
            style={{
              flex: 1,
              minWidth: "180px",
              height: "42px",
              borderRadius: "999px",
              background: canSubmit ? theme.primary : theme.softBg,
              color: canSubmit ? "#fff" : theme.muted,
              fontWeight: 700,
              border: "none",
              fontSize: "13px",
              opacity: canSubmit ? 1 : 0.7,
              cursor: canSubmit ? "pointer" : "not-allowed",
            }}
          >
            {submitting ? "Rescheduling..." : "Reschedule Group Session"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default GroupRescheduleSessionModal;