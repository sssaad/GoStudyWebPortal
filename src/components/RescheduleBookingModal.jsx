import React, { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import moment from "moment-timezone";
import { getTimezonesLookup } from "../api/getTimezonesLookup";
import { getToken } from "../api/getToken";

const ADMIN_TIMEZONE = "Asia/Dubai";

const TEACHER_PROFILE_URL =
  "https://api.learnyourlanguage.org/RestController_Thirdparty.php?view=teacher_profile";

const RUN_STORED_PROCEDURE_URL =
  "https://api.learnyourlanguage.org/RestController_Thirdparty.php?view=runStoredProcedure";

const RESCHEDULE_BOOKING_URL =
  "https://api.learnyourlanguage.org/RestController_Thirdparty.php?view=reshedule_booking";

const themeNativeStyles = `
  .reschedule-modal-theme .theme-native-control,
  .reschedule-modal-theme .theme-native-control.form-select,
  .reschedule-modal-theme .theme-native-control.form-control {
    background-color: var(--bs-body-bg) !important;
    color: var(--bs-emphasis-color) !important;
    border: 1px solid var(--bs-border-color) !important;
    -webkit-text-fill-color: var(--bs-emphasis-color) !important;
    box-shadow: none !important;
    appearance: auto !important;
    opacity: 1 !important;
  }

  .reschedule-modal-theme .theme-native-control:focus {
    border-color: var(--bs-primary) !important;
    box-shadow: 0 0 0 0.15rem rgba(var(--bs-primary-rgb), 0.12) !important;
    background-color: var(--bs-body-bg) !important;
    color: var(--bs-emphasis-color) !important;
  }

  .reschedule-modal-theme .theme-native-control option {
    background-color: var(--bs-body-bg) !important;
    color: var(--bs-emphasis-color) !important;
  }

  .reschedule-modal-theme .theme-native-control:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }

  [data-bs-theme="dark"] .reschedule-modal-theme .theme-native-control,
  [data-theme="dark"] .reschedule-modal-theme .theme-native-control,
  .dark .reschedule-modal-theme .theme-native-control,
  body.dark .reschedule-modal-theme .theme-native-control {
    color-scheme: dark;
  }

  [data-bs-theme="light"] .reschedule-modal-theme .theme-native-control,
  [data-theme="light"] .reschedule-modal-theme .theme-native-control,
  .light .reschedule-modal-theme .theme-native-control,
  body.light .reschedule-modal-theme .theme-native-control {
    color-scheme: light;
  }

  [data-bs-theme="dark"] .reschedule-modal-theme input[type="date"].theme-native-control::-webkit-calendar-picker-indicator,
  [data-theme="dark"] .reschedule-modal-theme input[type="date"].theme-native-control::-webkit-calendar-picker-indicator,
  .dark .reschedule-modal-theme input[type="date"].theme-native-control::-webkit-calendar-picker-indicator,
  body.dark .reschedule-modal-theme input[type="date"].theme-native-control::-webkit-calendar-picker-indicator {
    filter: invert(1);
  }

  .reschedule-modal-theme .slot-btn,
  .reschedule-modal-theme .day-btn,
  .reschedule-modal-theme .nav-circle-btn,
  .reschedule-modal-theme .modal-action-btn {
    transition: all 0.2s ease;
  }

  .reschedule-modal-theme .slot-btn:hover,
  .reschedule-modal-theme .day-btn:hover,
  .reschedule-modal-theme .modal-action-btn:hover {
    transform: translateY(-1px);
  }

  .reschedule-modal-theme .nav-circle-btn:hover {
    transform: scale(1.04);
  }

  @media (max-width: 767px) {
    .reschedule-modal-theme .week-day-col {
      min-width: 110px;
    }
  }
`;

const DATETIME_FORMATS = [
  "YYYY-MM-DD HH:mm:ss.SSSSSS",
  "YYYY-MM-DD HH:mm:ss",
  "YYYY-MM-DD HH:mm",
  "YYYY/MM/DD HH:mm:ss.SSSSSS",
  "YYYY/MM/DD HH:mm:ss",
  "YYYY/MM/DD HH:mm",
  moment.ISO_8601,
];

const DAY_TO_ISO = {
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
  Sunday: 7,
};

const firstFilled = (...values) =>
  values.find(
    (value) =>
      value !== undefined &&
      value !== null &&
      String(value).trim() !== ""
  ) ?? "";

const safeJsonArray = (value) => {
  if (!value || typeof value !== "string") {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const uniqueBy = (items, getKey) => {
  const seen = new Set();

  return (items || []).filter((item) => {
    const key = getKey(item);

    if (!key || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
};

const extractIanaTimezone = (...candidates) => {
  for (const rawValue of candidates) {
    const value = String(rawValue ?? "").trim();

    if (!value) {
      continue;
    }

    if (moment.tz.zone(value)) {
      return value;
    }

    const match = value.match(
      /[A-Za-z_]+\/[A-Za-z_]+(?:\/[A-Za-z_]+)?/
    );

    if (match?.[0] && moment.tz.zone(match[0])) {
      return match[0];
    }
  }

  return "";
};

const getSafeTimezone = (value, fallback = ADMIN_TIMEZONE) =>
  extractIanaTimezone(value) || fallback;

const parseClockParts = (value) => {
  const normalized = String(value || "").split(".")[0];

  const parsed = moment(
    normalized,
    ["HH:mm:ss", "HH:mm"],
    true
  );

  if (!parsed.isValid()) {
    return null;
  }

  return {
    hour: parsed.hour(),
    minute: parsed.minute(),
    second: parsed.second(),
  };
};

const formatClock = (value) => {
  const parts = parseClockParts(value);

  if (!parts) {
    return "--:--";
  }

  return moment()
    .hour(parts.hour)
    .minute(parts.minute)
    .second(parts.second)
    .format("HH:mm");
};

const parseSelectedDate = (value) => {
  if (!value) {
    return null;
  }

  const parsed = moment.tz(
    value,
    "YYYY-MM-DD",
    true,
    ADMIN_TIMEZONE
  );

  return parsed.isValid() ? parsed : null;
};

const parseDateTimeInTimezone = (
  dateValue,
  timeValue,
  timezone
) => {
  if (!dateValue || !timeValue || !timezone) {
    return null;
  }

  const normalizedTime = String(timeValue).split(".")[0];
  const fullValue = `${dateValue} ${normalizedTime}`;

  let parsed = moment.tz(
    fullValue,
    DATETIME_FORMATS,
    true,
    timezone
  );

  if (!parsed.isValid()) {
    parsed = moment.tz(
      fullValue,
      DATETIME_FORMATS,
      timezone
    );
  }

  return parsed.isValid() ? parsed : null;
};

const getTodayInDubai = () =>
  moment.tz(ADMIN_TIMEZONE).startOf("day");

const getWeekStart = (dateMoment) =>
  (
    dateMoment?.clone?.() ||
    moment.tz(ADMIN_TIMEZONE)
  ).startOf("isoWeek");

const getDefaultDateForWeek = (weekStart) => {
  const today = getTodayInDubai();
  const currentWeekStart = getWeekStart(today);

  return weekStart
    .clone()
    .startOf("day")
    .isSame(currentWeekStart, "day")
    ? today.format("YYYY-MM-DD")
    : weekStart.format("YYYY-MM-DD");
};

const isOverlap = (
  startA,
  endA,
  startB,
  endB
) => {
  const aStart = moment.isMoment(startA)
    ? startA.clone()
    : moment.parseZone(startA);

  const aEnd = moment.isMoment(endA)
    ? endA.clone()
    : moment.parseZone(endA);

  const bStart = moment.isMoment(startB)
    ? startB.clone()
    : moment.parseZone(startB);

  const bEnd = moment.isMoment(endB)
    ? endB.clone()
    : moment.parseZone(endB);

  return (
    aStart.isBefore(bEnd) &&
    aEnd.isAfter(bStart)
  );
};

const resolveToken = (response) => {
  if (typeof response === "string") {
    return response;
  }

  return (
    response?.token ||
    response?.data?.token ||
    response?.data?.data?.token ||
    response?.access_token ||
    response?.data?.access_token ||
    ""
  );
};

const buildApiHeaders = async () => {
  const token = resolveToken(await getToken());

  return {
    projectid: "1",
    userid: "test",
    password: "test",
    "x-api-key": "abc123456789",
    ...(token ? { token } : {}),
  };
};

const fetchTeacherProfile = async (
  teacherId,
  headers
) => {
  const response = await axios.post(
    TEACHER_PROFILE_URL,
    {
      teacherid: teacherId,
    },
    {
      headers,
    }
  );

  return response.data;
};

const fetchTeacherBookedSlots = async (
  teacherId,
  headers
) => {
  const response = await axios.post(
    RUN_STORED_PROCEDURE_URL,
    {
      procedureName: "get_teacher_bookings",
      parameters: [teacherId],
    },
    {
      headers,
    }
  );

  return response.data;
};

const submitReschedule = async (
  payload,
  headers
) => {
  const response = await axios.post(
    RESCHEDULE_BOOKING_URL,
    payload,
    {
      headers,
    }
  );

  return response.data;
};

const extractArray = (response) =>
  [
    response,
    response?.data,
    response?.data?.data,
    response?.timezones,
    response?.data?.timezones,
    response?.lookup,
    response?.data?.lookup,
  ].find(Array.isArray) || [];

const normalizeTimezones = (
  response,
  fallbackZones = []
) => {
  const lookupItems = extractArray(response)
    .map((item) => {
      if (typeof item === "string") {
        const value = extractIanaTimezone(item);

        return value
          ? {
            id: "",
            value,
            label: item,
          }
          : null;
      }

      const value = extractIanaTimezone(
        item?.timezone,
        item?.zone,
        item?.iana,
        item?.value,
        item?.timezone_name,
        item?.timezonename,
        item?.name,
        item?.label
      );

      if (!value) {
        return null;
      }

      return {
        id: String(
          firstFilled(
            item?.timezoneid,
            item?.id,
            ""
          )
        ),
        value,
        label: String(
          firstFilled(
            item?.timezonename,
            item?.timezone_name,
            item?.label,
            item?.name,
            value
          )
        ),
      };
    })
    .filter(Boolean);

  const fallbackItems = fallbackZones
    .map((zone) => extractIanaTimezone(zone))
    .filter(Boolean)
    .map((value) => ({
      id: "",
      value,
      label: value,
    }));

  return uniqueBy(
    [...lookupItems, ...fallbackItems],
    (item) => item.value
  );
};

const normalizeSubjects = (
  profileData,
  booking
) => {
  const tableSubjects = Array.isArray(
    profileData?.teachingprofile_subjects
  )
    ? profileData.teachingprofile_subjects
    : [];

  const profileSubjects = safeJsonArray(
    profileData?.profile?.[0]?.teacherSubjects
  );

  const bookingSubject = booking?.subjectname
    ? [
      {
        subjectid: booking?.subjectid,
        subjectname: booking?.subjectname,
      },
    ]
    : [];

  return uniqueBy(
    [
      ...bookingSubject,

      ...tableSubjects.map((item) => ({
        subjectid: item?.subjectid,
        subjectname: item?.subjectname,
      })),

      ...profileSubjects.map((item) => ({
        subjectid: item?.subjectid,
        subjectname: item?.subjectname,
      })),
    ].filter((item) => item?.subjectname),

    (item) =>
      String(
        firstFilled(
          item?.subjectid,
          item?.subjectname
        )
      ).toLowerCase()
  );
};

const normalizeAvailability = (profileData) => {
  const tableAvailability = Array.isArray(
    profileData?.teacheravailability
  )
    ? profileData.teacheravailability
    : [];

  const profileAvailability = safeJsonArray(
    profileData?.profile?.[0]?.availability
  );

  return uniqueBy(
    [...tableAvailability, ...profileAvailability]
      .map((item) => ({
        day: item?.day,
        timefrom: item?.timefrom,
        timeto: item?.timeto,
        timezoneid: item?.timezoneid,
        deleted: item?.deleted,
      }))
      .filter(
        (item) =>
          item.day &&
          item.timefrom &&
          item.timeto &&
          String(item.deleted ?? "0") !== "1"
      ),

    (item) =>
      `${item.day}|${item.timefrom}|${item.timeto}|${item.timezoneid ?? ""
      }`
  );
};

const normalizeBookedSlots = (
  response,
  fallbackTimezone = ""
) => {
  const raw = Array.isArray(response?.data)
    ? response.data
    : Array.isArray(response?.data?.data)
      ? response.data.data
      : [];

  const fallbackZone =
    extractIanaTimezone(fallbackTimezone);

  return uniqueBy(
    raw
      .map((item) => ({
        bookingid: firstFilled(
          item?.bookingid,
          item?.bookingId,
          item?.bookteacherid,
          ""
        ),

        bookdate:
          item?.bookdate ||
          item?.booking_date,

        slot_start: item?.slot_start,
        slot_end: item?.slot_end,

        timezoneid: firstFilled(
          item?.timezoneid,
          item?.timezone_id,
          ""
        ),

        timezone:
          extractIanaTimezone(
            item?.timezone,
            item?.timezonename,
            item?.timezone_name
          ) || fallbackZone,
      }))
      .filter(
        (item) =>
          item.bookdate &&
          item.slot_start &&
          item.slot_end
      ),

    (item) =>
      `${item.bookingid}|${item.bookdate}|${item.slot_start}|${item.slot_end}|${item.timezone}|${item.timezoneid}`
  );
};

const RescheduleBookingModal = ({
  isOpen,
  onClose,
  onSuccess,
  booking,
  timezone = ADMIN_TIMEZONE,
}) => {
  const submitLockRef = useRef(false);

  const [
    selectedSubjectId,
    setSelectedSubjectId,
  ] = useState("");

  const [
    selectedDate,
    setSelectedDate,
  ] = useState("");

  const [
    selectedSlot,
    setSelectedSlot,
  ] = useState(null);

  const [
    selectedWeekStart,
    setSelectedWeekStart,
  ] = useState(null);

  const [
    useCustomSlot,
    setUseCustomSlot,
  ] = useState(false);

  const [
    customStartTime,
    setCustomStartTime,
  ] = useState("");

  const [
    customEndTime,
    setCustomEndTime,
  ] = useState("");

  const [
    subjectOptions,
    setSubjectOptions,
  ] = useState([]);

  const [
    teacherAvailability,
    setTeacherAvailability,
  ] = useState([]);

  const [
    teacherBookedSlots,
    setTeacherBookedSlots,
  ] = useState([]);

  const [
    timezoneOptions,
    setTimezoneOptions,
  ] = useState([]);

  const [
    teacherProfileData,
    setTeacherProfileData,
  ] = useState(null);

  const [
    profileLoading,
    setProfileLoading,
  ] = useState(false);

  const [
    submitting,
    setSubmitting,
  ] = useState(false);

  const [
    profileError,
    setProfileError,
  ] = useState("");

  const [
    submitError,
    setSubmitError,
  ] = useState("");

  const [
    bookedSlotsWarning,
    setBookedSlotsWarning,
  ] = useState("");

  const studentTimezone = useMemo(
    () =>
      extractIanaTimezone(
        booking?.studentTime_zone,
        booking?.student_timezone,
        booking?.studentTimezone
      ),
    [booking]
  );

  useEffect(() => {
    if (!isOpen || !booking) {
      return undefined;
    }

    let active = true;

    const currentWeek = getWeekStart(
      moment.tz(ADMIN_TIMEZONE)
    );

    setSelectedSubjectId(
      String(
        firstFilled(
          booking?.subjectid,
          booking?.subjectname
        )
      )
    );

    setSelectedDate(
      getDefaultDateForWeek(currentWeek)
    );

    setSelectedWeekStart(currentWeek);
    setSelectedSlot(null);
    setUseCustomSlot(false);
    setCustomStartTime("");
    setCustomEndTime("");
    setSubjectOptions([]);
    setTeacherAvailability([]);
    setTeacherBookedSlots([]);
    setTeacherProfileData(null);
    setProfileError("");
    setSubmitError("");
    setBookedSlotsWarning("");

    setTimezoneOptions(
      normalizeTimezones(null, [
        studentTimezone,
        booking?.teacherTime_zone,
        booking?.teacher_timezone,
        timezone,
        ADMIN_TIMEZONE,
      ])
    );

    const loadModalData = async () => {
      if (!booking?.teacherid) {
        setProfileError(
          "Teacher ID is missing."
        );

        return;
      }

      setProfileLoading(true);

      try {
        const headers =
          await buildApiHeaders();

        const [
          profileResult,
          timezoneResult,
          bookedResult,
        ] = await Promise.allSettled([
          fetchTeacherProfile(
            booking.teacherid,
            headers
          ),

          getTimezonesLookup(),

          fetchTeacherBookedSlots(
            booking.teacherid,
            headers
          ),
        ]);

        if (!active) {
          return;
        }

        setTimezoneOptions(
          normalizeTimezones(
            timezoneResult.status === "fulfilled"
              ? timezoneResult.value
              : null,
            [
              studentTimezone,
              booking?.teacherTime_zone,
              booking?.teacher_timezone,
              timezone,
              ADMIN_TIMEZONE,
            ]
          )
        );

        const profileResponse =
          profileResult.status === "fulfilled"
            ? profileResult.value
            : null;

        if (
          Number(profileResponse?.statusCode) !== 200
        ) {
          throw new Error(
            "The teacher profile could not be loaded."
          );
        }

        const profileData =
          profileResponse?.data || {};

        const subjects =
          normalizeSubjects(
            profileData,
            booking
          );

        setTeacherProfileData(profileData);
        setSubjectOptions(subjects);

        setTeacherAvailability(
          normalizeAvailability(profileData)
        );

        setSelectedSubjectId(
          String(
            firstFilled(
              booking?.subjectid,
              subjects?.[0]?.subjectid,
              booking?.subjectname,
              subjects?.[0]?.subjectname
            )
          )
        );

        const bookedResponse =
          bookedResult.status === "fulfilled"
            ? bookedResult.value
            : null;

        if (
          Number(bookedResponse?.statusCode) === 200
        ) {
          setTeacherBookedSlots(
            normalizeBookedSlots(
              bookedResponse,
              booking?.teacherTime_zone ||
              booking?.teacher_timezone ||
              studentTimezone
            )
          );
        } else {
          setTeacherBookedSlots([]);

          setBookedSlotsWarning(
            "Booked slots could not be loaded. Rescheduling is disabled to prevent double booking."
          );
        }
      } catch (error) {
        if (!active) {
          return;
        }

        console.error(
          "Reschedule modal load failed:",
          error
        );

        setProfileError(
          "The teacher profile or booking data could not be loaded."
        );
      } finally {
        if (active) {
          setProfileLoading(false);
        }
      }
    };

    loadModalData();

    return () => {
      active = false;
    };
  }, [
    isOpen,
    booking,
    studentTimezone,
    timezone,
  ]);

  const timezoneById = useMemo(() => {
    const map = {};

    timezoneOptions.forEach((item) => {
      if (item?.id) {
        map[String(item.id)] = item.value;
      }
    });

    return map;
  }, [timezoneOptions]);

  const studentTimezoneId = useMemo(() => {
    const lookupId = String(
      timezoneOptions.find(
        (item) =>
          item.value === studentTimezone
      )?.id || ""
    ).trim();

    const bookingTimezoneId = String(
      firstFilled(
        booking?.studentTimezoneId,
        booking?.studenttimezoneid,
        booking?.student_timezone_id,
        booking?.studentTimeZoneId,
        booking?.student_timezoneid,
        booking?.studentTime_zoneid,
        booking?.student_time_zone_id,
        ""
      )
    ).trim();

    const resolvedId =
      lookupId || bookingTimezoneId;

    return /^\d+$/.test(resolvedId)
      ? resolvedId
      : "";
  }, [
    timezoneOptions,
    studentTimezone,
    booking,
  ]);

  const teacherBaseTimezone = useMemo(() => {
    const profile =
      teacherProfileData?.profile?.[0] ||
      {};

    return getSafeTimezone(
      timezoneById[
      String(profile?.timezoneid)
      ] ||
      booking?.teacherTime_zone ||
      booking?.teacher_timezone ||
      ADMIN_TIMEZONE
    );
  }, [
    teacherProfileData,
    timezoneById,
    booking,
  ]);

  const selectedSubject = useMemo(
    () =>
      subjectOptions.find(
        (item) =>
          String(
            firstFilled(
              item?.subjectid,
              item?.subjectname
            )
          ) === String(selectedSubjectId)
      ) || null,
    [
      subjectOptions,
      selectedSubjectId,
    ]
  );

  const currentSessionInDubai = useMemo(() => {
    if (!studentTimezone) {
      return null;
    }

    const bookingDate =
      booking?.bookdate ||
      booking?.booking_date ||
      "";

    let start =
      parseDateTimeInTimezone(
        bookingDate,
        booking?.slot_start,
        studentTimezone
      );

    let end =
      parseDateTimeInTimezone(
        bookingDate,
        booking?.slot_end,
        studentTimezone
      );

    if (!start || !end) {
      return null;
    }

    if (end.isSameOrBefore(start)) {
      end.add(1, "day");
    }

    return {
      start: start
        .clone()
        .tz(ADMIN_TIMEZONE),

      end: end
        .clone()
        .tz(ADMIN_TIMEZONE),
    };
  }, [
    booking,
    studentTimezone,
  ]);

  const todayDubai = useMemo(
    () => getTodayInDubai(),
    [isOpen]
  );

  const currentWeekStart = useMemo(
    () => getWeekStart(todayDubai),
    [todayDubai]
  );

  const weekDays = useMemo(() => {
    const start = selectedWeekStart
      ? selectedWeekStart.clone()
      : currentWeekStart.clone();

    return Array.from(
      {
        length: 7,
      },
      (_, index) =>
        start
          .clone()
          .add(index, "day")
    );
  }, [
    selectedWeekStart,
    currentWeekStart,
  ]);

  const canGoPreviousWeek = useMemo(() => {
    const activeWeek = selectedWeekStart
      ? selectedWeekStart
        .clone()
        .startOf("day")
      : currentWeekStart
        .clone()
        .startOf("day");

    return activeWeek.isAfter(
      currentWeekStart
        .clone()
        .startOf("day"),
      "day"
    );
  }, [
    selectedWeekStart,
    currentWeekStart,
  ]);

  const bookedRanges = useMemo(
    () =>
      teacherBookedSlots
        .filter((item) => {
          const currentBookingId = String(
            firstFilled(
              booking?.bookingid,
              booking?.id,
              booking?.bookteacherid,
              ""
            )
          );

          const bookedItemId = String(
            firstFilled(
              item?.bookingid,
              item?.bookingId,
              item?.bookteacherid,
              ""
            )
          );

          // Current booking ko apne aap se conflict nahi karna
          if (
            currentBookingId &&
            bookedItemId &&
            currentBookingId === bookedItemId
          ) {
            return false;
          }

          return true;
        })
        .map((item) => {
          const sourceTimezone =
            getSafeTimezone(
              timezoneById[
              String(item?.timezoneid)
              ] ||
              item?.timezone ||
              teacherBaseTimezone
            );

          let start =
            parseDateTimeInTimezone(
              item?.bookdate,
              item?.slot_start,
              sourceTimezone
            );

          let end =
            parseDateTimeInTimezone(
              item?.bookdate,
              item?.slot_end,
              sourceTimezone
            );

          if (!start || !end) {
            return null;
          }

          if (end.isSameOrBefore(start)) {
            end.add(1, "day");
          }

          return {
            bookingid: item?.bookingid,

            start: start
              .clone()
              .tz(ADMIN_TIMEZONE),

            end: end
              .clone()
              .tz(ADMIN_TIMEZONE),
          };
        })
        .filter(Boolean),
    [
      teacherBookedSlots,
      timezoneById,
      teacherBaseTimezone,
      booking?.bookingid,
      booking?.id,
      booking?.bookteacherid,
    ]
  );

  const slotsMap = useMemo(() => {
    const map = Object.fromEntries(
      weekDays.map((day) => [
        day.format("YYYY-MM-DD"),
        [],
      ])
    );

    const visibleStart =
      weekDays[0]
        .clone()
        .startOf("day");

    const visibleEnd =
      weekDays[6]
        .clone()
        .endOf("day");

    const now =
      moment.tz(ADMIN_TIMEZONE);

    teacherAvailability.forEach((item) => {
      const isoDay =
        DAY_TO_ISO[item?.day];

      const startParts =
        parseClockParts(item?.timefrom);

      const endParts =
        parseClockParts(item?.timeto);

      if (
        !isoDay ||
        !startParts ||
        !endParts
      ) {
        return;
      }

      const sourceTimezone =
        getSafeTimezone(
          timezoneById[
          String(item?.timezoneid)
          ] ||
          teacherBaseTimezone
        );

      const sourceWeekStart =
        visibleStart
          .clone()
          .tz(sourceTimezone)
          .startOf("isoWeek");

      [-7, 0, 7].forEach((offset) => {
        const sourceDate =
          sourceWeekStart
            .clone()
            .add(offset, "days")
            .isoWeekday(isoDay);

        const sourceStart =
          sourceDate
            .clone()
            .hour(startParts.hour)
            .minute(startParts.minute)
            .second(startParts.second)
            .millisecond(0);

        const sourceEnd =
          sourceDate
            .clone()
            .hour(endParts.hour)
            .minute(endParts.minute)
            .second(endParts.second)
            .millisecond(0);

        if (sourceEnd.isSame(sourceStart)) {
          return;
        }

        if (sourceEnd.isBefore(sourceStart)) {
          sourceEnd.add(1, "day");
        }

        const adminStart =
          sourceStart
            .clone()
            .tz(ADMIN_TIMEZONE);

        const adminEnd =
          sourceEnd
            .clone()
            .tz(ADMIN_TIMEZONE);

        const dayKey =
          adminStart.format("YYYY-MM-DD");

        if (
          adminStart.isSameOrBefore(now) ||
          adminEnd.isBefore(visibleStart) ||
          adminStart.isAfter(visibleEnd) ||
          !map[dayKey]
        ) {
          return;
        }

        map[dayKey].push({
          label: `${adminStart.format(
            "HH:mm"
          )} - ${adminEnd.format("HH:mm")}`,

          start: adminStart.format(),
          end: adminEnd.format(),

          isBooked: bookedRanges.some((range) =>
            isOverlap(
              adminStart,
              adminEnd,
              range.start,
              range.end
            )
          ),
        });
      });
    });

    bookedRanges.forEach((range) => {
      const dayKey =
        range.start.format("YYYY-MM-DD");

      if (
        !map[dayKey] ||
        range.end.isSameOrBefore(now)
      ) {
        return;
      }

      const alreadyDisplayed =
        map[dayKey].some((slot) =>
          isOverlap(
            moment.parseZone(slot.start),
            moment.parseZone(slot.end),
            range.start,
            range.end
          )
        );

      if (!alreadyDisplayed) {
        map[dayKey].push({
          label: `${range.start.format(
            "HH:mm"
          )} - ${range.end.format("HH:mm")}`,

          start: range.start.format(),
          end: range.end.format(),
          isBooked: true,
        });
      }
    });

    Object.keys(map).forEach((dayKey) => {
      map[dayKey] = uniqueBy(
        map[dayKey].sort(
          (firstSlot, secondSlot) =>
            moment
              .parseZone(firstSlot.start)
              .valueOf() -
            moment
              .parseZone(secondSlot.start)
              .valueOf()
        ),
        (slot) =>
          `${slot.start}|${slot.end}`
      );
    });

    return map;
  }, [
    weekDays,
    teacherAvailability,
    timezoneById,
    teacherBaseTimezone,
    bookedRanges,
  ]);

  useEffect(() => {
    if (
      useCustomSlot ||
      !selectedSlot ||
      !selectedDate
    ) {
      return;
    }

    const stillAvailable =
      (
        slotsMap[selectedDate] || []
      ).some(
        (slot) =>
          slot.start ===
          selectedSlot.start &&
          slot.end ===
          selectedSlot.end &&
          !slot.isBooked
      );

    if (!stillAvailable) {
      setSelectedSlot(null);
    }
  }, [
    slotsMap,
    selectedDate,
    selectedSlot,
    useCustomSlot,
  ]);

  const changeWeek = (days) => {
    const nextWeek = (
      selectedWeekStart ||
      currentWeekStart
    )
      .clone()
      .add(days, "days");

    setSelectedWeekStart(nextWeek);

    setSelectedDate(
      getDefaultDateForWeek(nextWeek)
    );

    setSelectedSlot(null);
    setSubmitError("");
  };

  const handleDateInputChange = (event) => {
    const value = event.target.value;
    const parsed = parseSelectedDate(value);

    if (
      parsed?.isBefore(
        todayDubai,
        "day"
      )
    ) {
      setSelectedDate(
        todayDubai.format("YYYY-MM-DD")
      );

      setSelectedWeekStart(
        currentWeekStart.clone()
      );
    } else {
      setSelectedDate(value);

      if (parsed) {
        setSelectedWeekStart(
          getWeekStart(parsed)
        );
      }
    }

    setSelectedSlot(null);
    setSubmitError("");
  };

  const handleDayPick = (day) => {
    if (
      day.isBefore(todayDubai, "day") ||
      submitting
    ) {
      return;
    }

    setSelectedDate(
      day.format("YYYY-MM-DD")
    );

    setSelectedSlot(null);
    setSubmitError("");
  };

  const handleSlotPick = (day, slot) => {
    if (slot?.isBooked || submitting) {
      return;
    }

    setSelectedDate(
      day.format("YYYY-MM-DD")
    );

    setSelectedWeekStart(
      getWeekStart(day)
    );

    setSelectedSlot(slot);
    setUseCustomSlot(false);
    setCustomStartTime("");
    setCustomEndTime("");
    setSubmitError("");
  };

  const toggleCustomSlot = () => {
    if (submitting) {
      return;
    }

    setUseCustomSlot(
      (previous) => !previous
    );

    setSelectedSlot(null);
    setSubmitError("");
  };

  const canSubmit = Boolean(
    selectedSubjectId &&
    selectedDate &&
    studentTimezone &&
    studentTimezoneId &&
    !profileLoading &&
    !profileError &&
    !bookedSlotsWarning &&
    !submitting &&
    (
      (
        !useCustomSlot &&
        selectedSlot &&
        !selectedSlot.isBooked
      ) ||
      (
        useCustomSlot &&
        customStartTime &&
        customEndTime
      )
    )
  );

  const handleSubmit = async () => {
    if (submitLockRef.current) {
      return;
    }

    if (!booking?.bookingid) {
      setSubmitError(
        "Booking ID is missing."
      );

      return;
    }

    if (!booking?.teacherid) {
      setSubmitError(
        "Teacher ID is missing."
      );

      return;
    }

    if (!studentTimezone) {
      setSubmitError(
        "The student's timezone is missing or invalid. Please update the student's profile before rescheduling."
      );

      return;
    }

    if (!studentTimezoneId) {
      setSubmitError(
        "The student's timezone ID could not be loaded. Please try again."
      );

      return;
    }

    if (profileError) {
      setSubmitError(
        "Required scheduling data could not be loaded. Please close the modal, reopen it, and try again."
      );

      return;
    }

    if (bookedSlotsWarning) {
      setSubmitError(
        "Booked slots could not be verified. Please reload the modal and try again."
      );

      return;
    }

    if (
      !useCustomSlot &&
      !selectedSlot
    ) {
      setSubmitError(
        "Please select an available time slot."
      );

      return;
    }

    if (
      !useCustomSlot &&
      selectedSlot?.isBooked
    ) {
      setSubmitError(
        "The selected time slot is already booked."
      );

      return;
    }

    if (
      useCustomSlot &&
      (
        !customStartTime ||
        !customEndTime
      )
    ) {
      setSubmitError(
        "Custom start and end times are required."
      );

      return;
    }

    if (
      !selectedSubject?.subjectid &&
      !booking?.subjectid
    ) {
      setSubmitError(
        "Subject ID is missing."
      );

      return;
    }

    submitLockRef.current = true;
    setSubmitting(true);
    setSubmitError("");

    try {
      const headers =
        await buildApiHeaders();

      let adminStart;
      let adminEnd;

      if (useCustomSlot) {
        adminStart = moment.tz(
          `${selectedDate} ${customStartTime}`,
          "YYYY-MM-DD HH:mm",
          true,
          ADMIN_TIMEZONE
        );

        adminEnd = moment.tz(
          `${selectedDate} ${customEndTime}`,
          "YYYY-MM-DD HH:mm",
          true,
          ADMIN_TIMEZONE
        );
      } else {
        adminStart = moment
          .parseZone(selectedSlot.start)
          .tz(ADMIN_TIMEZONE);

        adminEnd = moment
          .parseZone(selectedSlot.end)
          .tz(ADMIN_TIMEZONE);
      }

      if (
        !adminStart.isValid() ||
        !adminEnd.isValid()
      ) {
        throw new Error(
          "The selected time slot is invalid."
        );
      }

      if (!adminEnd.isAfter(adminStart)) {
        throw new Error(
          "The end time must be later than the start time."
        );
      }

      if (
        adminStart.isSameOrBefore(
          moment.tz(ADMIN_TIMEZONE)
        )
      ) {
        throw new Error(
          "A past time cannot be selected."
        );
      }

      // Normal listed slots must respect teacher booking conflicts.
      // Custom Slot is an admin override and may overlap existing bookings.
      if (!useCustomSlot) {
        const latestBookedResponse =
          await fetchTeacherBookedSlots(
            booking.teacherid,
            headers
          );

        if (
          Number(
            latestBookedResponse?.statusCode
          ) !== 200
        ) {
          throw new Error(
            "Booked slots could not be verified. Please try again."
          );
        }

        const latestBookedSlots =
          normalizeBookedSlots(
            latestBookedResponse,
            teacherBaseTimezone
          );

        const hasConflict =
          latestBookedSlots.some((item) => {
            const currentBookingId = String(
              firstFilled(
                booking?.bookingid,
                booking?.id,
                booking?.bookteacherid,
                ""
              )
            );

            const bookedItemId = String(
              firstFilled(
                item?.bookingid,
                item?.bookingId,
                item?.bookteacherid,
                ""
              )
            );

            if (
              currentBookingId &&
              bookedItemId &&
              currentBookingId === bookedItemId
            ) {
              return false;
            }

            const sourceTimezone =
              getSafeTimezone(
                timezoneById[
                String(item?.timezoneid)
                ] ||
                item?.timezone ||
                teacherBaseTimezone
              );

            let bookedStart =
              parseDateTimeInTimezone(
                item?.bookdate,
                item?.slot_start,
                sourceTimezone
              );

            let bookedEnd =
              parseDateTimeInTimezone(
                item?.bookdate,
                item?.slot_end,
                sourceTimezone
              );

            if (!bookedStart || !bookedEnd) {
              return false;
            }

            if (
              bookedEnd.isSameOrBefore(
                bookedStart
              )
            ) {
              bookedEnd.add(1, "day");
            }

            return isOverlap(
              adminStart,
              adminEnd,
              bookedStart
                .clone()
                .tz(ADMIN_TIMEZONE),
              bookedEnd
                .clone()
                .tz(ADMIN_TIMEZONE)
            );
          });

        if (hasConflict) {
          throw new Error(
            "The selected time slot has just been booked. Please select another slot."
          );
        }
      }

      const studentStart =
        adminStart
          .clone()
          .tz(studentTimezone);

      const studentEnd =
        adminEnd
          .clone()
          .tz(studentTimezone);

      const payload = {
        bookingId: booking.bookingid,

        newDate:
          studentStart.format("YYYY-MM-DD"),

        newStartTime:
          studentStart.format("HH:mm"),

        newEndTime:
          studentEnd.format("HH:mm"),

        newTimezone: studentTimezoneId,

        newSubjectid: Number(
          selectedSubject?.subjectid ??
          booking?.subjectid
        ),
      };

      const result =
        await submitReschedule(
          payload,
          headers
        );

      if (Number(result?.statusCode) !== 200) {
        throw new Error(
          "The session could not be rescheduled."
        );
      }

      try {
        if (
          typeof onSuccess === "function"
        ) {
          await Promise.resolve(onSuccess());
        }
      } catch (refreshError) {
        console.error(
          "Bookings refresh failed after rescheduling:",
          refreshError
        );
      }

      onClose?.();
    } catch (error) {
      console.error(
        "Reschedule submission failed:",
        error
      );

      setSubmitError(
        error?.message ||
        "The session could not be rescheduled. Please try again."
      );
    } finally {
      submitLockRef.current = false;
      setSubmitting(false);
    }
  };

  const closeSafely = () => {
    if (
      !submitting &&
      !submitLockRef.current
    ) {
      onClose?.();
    }
  };

  if (!isOpen) {
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
    primarySubtle:
      "var(--bs-primary-bg-subtle)",
    primaryText:
      "var(--bs-primary-text-emphasis)",
    secondaryBtnBg:
      "var(--bs-secondary-bg)",
    secondaryBtnText:
      "var(--bs-body-color)",
    warning: "var(--bs-warning)",
    dangerBg:
      "var(--bs-danger-bg-subtle)",
    dangerText:
      "var(--bs-danger-text-emphasis)",
    dangerBorder:
      "var(--bs-danger-border-subtle)",
    shadow:
      "0 18px 48px rgba(2, 6, 23, 0.18)",
  };

  const styles = {
    modal: {
      width: "min(1100px, 98vw)",
      maxHeight: "94vh",
      overflowY: "auto",
      background: theme.modalBg,
      borderRadius: "18px",
      boxShadow: theme.shadow,
      padding: "20px 22px 24px",
      border: `1px solid ${theme.border}`,
      color: theme.text,
    },

    section: {
      border: `1px solid ${theme.border}`,
      borderRadius: "10px",
      background: theme.sectionBg,
      padding: "14px",
    },

    sectionHeading: {
      fontSize: "14px",
      fontWeight: 700,
      color: theme.heading,
      marginBottom: "14px",
    },

    label: {
      fontWeight: 500,
      color: theme.muted,
      fontSize: "12px",
      marginBottom: "6px",
    },
  };

  const currentTeacher =
    booking?.teachername ||
    booking?.teacher_name ||
    booking?.teacher ||
    "-";

  const currentSubject =
    booking?.subjectname || "-";

  const currentDate =
    currentSessionInDubai
      ? currentSessionInDubai.start.format(
        "DD MMM YYYY"
      )
      : "-";

  const currentTime =
    currentSessionInDubai
      ? `${currentSessionInDubai.start.format(
        "HH:mm"
      )} - ${currentSessionInDubai.end.format(
        "HH:mm"
      )}`
      : `${formatClock(
        booking?.slot_start
      )} - ${formatClock(
        booking?.slot_end
      )}`;

  const selectedDateLabel =
    parseSelectedDate(selectedDate)?.format(
      "DD MMM YYYY"
    ) || "-";

  const selectedTimeLabel = useCustomSlot
    ? customStartTime && customEndTime
      ? `${customStartTime} - ${customEndTime}`
      : "Custom slot"
    : selectedSlot?.label || "-";

  const timezoneWarning =
    !profileLoading &&
      (
        !studentTimezone ||
        !studentTimezoneId
      )
      ? "The student's timezone or timezone ID could not be loaded. Rescheduling is disabled."
      : "";

  return (
    <div
      className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center reschedule-modal-theme"
      style={{
        background: theme.overlay,
        zIndex: 2000,
        padding: "16px",
      }}
      onClick={closeSafely}
    >
      <style>{themeNativeStyles}</style>

      <div
        style={styles.modal}
        onClick={(event) =>
          event.stopPropagation()
        }
      >
        <div
          className="d-flex justify-content-between align-items-center pb-3 mb-3"
          style={{
            borderBottom:
              `1px solid ${theme.border}`,
          }}
        >
          <h4
            className="mb-0"
            style={{
              fontSize: "18px",
              fontWeight: 700,
              color: theme.heading,
              lineHeight: 1.2,
            }}
          >
            Reschedule Session
          </h4>

          <button
            type="button"
            className="btn btn-sm"
            onClick={closeSafely}
            disabled={submitting}
            style={{
              border: "none",
              background: "transparent",
              fontSize: "20px",
              lineHeight: 1,
              color: theme.muted,
              boxShadow: "none",
              padding: "2px 6px",
            }}
          >
            ×
          </button>
        </div>

        {profileError ? (
          <div className="alert alert-danger py-2">
            {profileError}
          </div>
        ) : null}

        {bookedSlotsWarning ? (
          <div className="alert alert-warning py-2">
            {bookedSlotsWarning}
          </div>
        ) : null}

        {submitError ? (
          <div className="alert alert-danger py-2">
            {submitError}
          </div>
        ) : null}

        <div
          className="mb-3"
          style={styles.section}
        >
          <h6 style={styles.sectionHeading}>
            Current Session Details
          </h6>

          <div className="row g-3 align-items-center">
            <div className="col-lg-6">
              <div
                style={{
                  padding: "12px 14px",
                  borderRadius: "10px",
                  border:
                    `1px solid ${theme.border}`,
                  background:
                    "var(--bs-body-bg)",
                }}
              >
                <div
                  style={{
                    fontSize: "14px",
                    fontWeight: 700,
                    color: theme.heading,
                    lineHeight: 1.3,
                  }}
                >
                  {currentTeacher}
                </div>

                <div
                  style={{
                    color: theme.muted,
                    fontSize: "12px",
                  }}
                >
                  Teacher
                </div>
              </div>

              <div
                className="mt-3 d-flex align-items-center gap-2"
                style={{
                  color: theme.muted,
                  fontSize: "13px",
                }}
              >
                <span style={{ fontSize: "15px" }}>
                  📅
                </span>

                <span>Date:</span>

                <strong
                  style={{
                    color: theme.heading,
                    fontSize: "13px",
                  }}
                >
                  {currentDate}
                </strong>
              </div>
            </div>

            <div className="col-lg-6">
              <div className="mb-3 d-flex align-items-start gap-2">
                <span
                  style={{
                    fontSize: "14px",
                    color: theme.primary,
                  }}
                >
                  ◌
                </span>

                <div>
                  <div
                    style={{
                      color: theme.muted,
                      fontSize: "12px",
                    }}
                  >
                    Subject:
                  </div>

                  <div
                    style={{
                      color: theme.heading,
                      fontSize: "14px",
                      fontWeight: 700,
                      lineHeight: 1.3,
                    }}
                  >
                    {currentSubject}
                  </div>
                </div>
              </div>

              <div className="d-flex align-items-start gap-2">
                <span
                  style={{
                    fontSize: "14px",
                    color: theme.warning,
                  }}
                >
                  ◔
                </span>

                <div>
                  <div
                    style={{
                      color: theme.muted,
                      fontSize: "12px",
                    }}
                  >
                    Time Slot:
                  </div>

                  <div
                    style={{
                      color: theme.heading,
                      fontSize: "14px",
                      fontWeight: 700,
                      lineHeight: 1.3,
                    }}
                  >
                    {currentTime}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div
          className="mb-3"
          style={styles.section}
        >
          <h6 style={styles.sectionHeading}>
            New Session Details
          </h6>

          <div className="row g-3 align-items-end">
            <div className="col-lg-6">
              <label
                className="form-label"
                style={styles.label}
              >
                Subject:
              </label>

              <select
                className="form-select theme-native-control"
                value={selectedSubjectId}
                disabled={
                  profileLoading ||
                  submitting
                }
                onChange={(event) => {
                  setSelectedSubjectId(
                    event.target.value
                  );

                  setSubmitError("");
                }}
                style={{
                  height: "40px",
                  borderRadius: "8px",
                  fontWeight: 600,
                  fontSize: "13px",
                }}
              >
                {!subjectOptions.length ? (
                  <option value="">
                    {profileLoading
                      ? "Loading..."
                      : "No subjects found"}
                  </option>
                ) : (
                  subjectOptions.map((item) => (
                    <option
                      key={`${item?.subjectid}-${item?.subjectname}`}
                      value={String(
                        firstFilled(
                          item?.subjectid,
                          item?.subjectname
                        )
                      )}
                    >
                      {item?.subjectname}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div className="col-lg-3">
              <div
                className="d-flex align-items-center gap-2"
                style={{
                  minHeight: "40px",
                }}
              >
                <span style={{ fontSize: "15px" }}>
                  📅
                </span>

                <span
                  style={{
                    color: theme.muted,
                    fontSize: "12px",
                  }}
                >
                  Date:
                </span>

                <strong
                  style={{
                    color: theme.heading,
                    fontSize: "13px",
                  }}
                >
                  {selectedDateLabel}
                </strong>
              </div>
            </div>

            <div className="col-lg-3">
              <div
                className="d-flex align-items-center gap-2"
                style={{
                  minHeight: "40px",
                }}
              >
                <span
                  style={{
                    fontSize: "15px",
                    color: theme.warning,
                  }}
                >
                  ◔
                </span>

                <span
                  style={{
                    color: theme.muted,
                    fontSize: "12px",
                  }}
                >
                  Time Slot:
                </span>

                <strong
                  style={{
                    color: theme.heading,
                    fontSize: "13px",
                  }}
                >
                  {selectedTimeLabel}
                </strong>
              </div>
            </div>
          </div>
        </div>

        <div className="row g-3 align-items-end mb-3">
          <div className="col-lg-8">
            <div className="d-flex align-items-center gap-2 flex-wrap">
              <div className="d-flex align-items-center gap-2">
                <button
                  type="button"
                  className="btn btn-sm nav-circle-btn"
                  onClick={() =>
                    changeWeek(-7)
                  }
                  disabled={
                    !canGoPreviousWeek ||
                    submitting
                  }
                  style={{
                    width: "30px",
                    height: "30px",
                    borderRadius: "50%",
                    border:
                      `1px solid ${theme.border}`,
                    background: theme.softBg,
                    color: theme.text,
                    fontSize: "15px",
                    padding: 0,
                    opacity:
                      canGoPreviousWeek
                        ? 1
                        : 0.5,
                    cursor:
                      canGoPreviousWeek
                        ? "pointer"
                        : "not-allowed",
                  }}
                >
                  ‹
                </button>

                <button
                  type="button"
                  className="btn btn-sm nav-circle-btn"
                  onClick={() =>
                    changeWeek(7)
                  }
                  disabled={submitting}
                  style={{
                    width: "30px",
                    height: "30px",
                    borderRadius: "50%",
                    border:
                      `1px solid ${theme.border}`,
                    background: theme.softBg,
                    color: theme.text,
                    fontSize: "15px",
                    padding: 0,
                  }}
                >
                  ›
                </button>
              </div>

              <div
                style={{
                  fontSize: "14px",
                  fontWeight: 700,
                  color: theme.heading,
                }}
              >
                {weekDays[0].format("MMM D")} -{" "}
                {weekDays[6].format(
                  "MMM D, YYYY"
                )}
              </div>

              <input
                type="date"
                className="form-control theme-native-control"
                min={todayDubai.format(
                  "YYYY-MM-DD"
                )}
                value={selectedDate}
                disabled={submitting}
                onChange={
                  handleDateInputChange
                }
                style={{
                  width: "240px",
                  height: "38px",
                  borderRadius: "8px",
                  fontSize: "13px",
                }}
              />
            </div>
          </div>

          <div className="col-lg-4">
            <label
              className="form-label text-center w-100"
              style={{
                fontSize: "12px",
                fontWeight: 700,
                color: theme.heading,
                marginBottom: "6px",
              }}
            >
              Admin Time Zone
            </label>

            <div
              style={{
                minHeight: "38px",
                borderRadius: "8px",
                border:
                  `1px solid ${theme.border}`,
                background:
                  "var(--bs-body-bg)",
                padding: "9px 12px",
                textAlign: "center",
                fontWeight: 700,
                fontSize: "13px",
                color: theme.heading,
              }}
            >
              Asia/Dubai (UAE Time)
            </div>

            <div
              className="mt-2 text-center"
              style={{
                fontSize: "11px",
                color: theme.muted,
                lineHeight: 1.35,
              }}
            >
              Student timezone:{" "}
              <strong>
                {studentTimezone ||
                  "Not available"}
              </strong>
              .
            </div>

            {timezoneWarning ? (
              <div
                className="mt-2 text-center"
                style={{
                  fontSize: "11px",
                  color:
                    "var(--bs-danger)",
                }}
              >
                {timezoneWarning}
              </div>
            ) : null}
          </div>
        </div>

        {profileLoading ? (
          <div className="text-center py-5">
            Loading teacher availability...
          </div>
        ) : (
          <div className="row g-2 mb-4 flex-nowrap overflow-auto">
            {weekDays.map((day) => {
              const dayKey =
                day.format("YYYY-MM-DD");

              const slots =
                slotsMap[dayKey] || [];

              const isSelected =
                selectedDate === dayKey;

              const isPastDay =
                day.isBefore(
                  todayDubai,
                  "day"
                );

              return (
                <div
                  key={dayKey}
                  className="col week-day-col"
                >
                  <div
                    style={{
                      minWidth: "110px",
                      textAlign: "center",
                    }}
                  >
                    <div
                      style={{
                        width: "26px",
                        height: "3px",
                        background:
                          theme.primary,
                        borderRadius: "999px",
                        margin:
                          "0 auto 10px",
                      }}
                    />

                    <div
                      style={{
                        fontWeight: 700,
                        color: theme.heading,
                        marginBottom: "6px",
                        fontSize: "12px",
                      }}
                    >
                      {day.format("ddd")}
                    </div>

                    <button
                      type="button"
                      className="day-btn"
                      disabled={
                        isPastDay ||
                        submitting
                      }
                      onClick={() =>
                        handleDayPick(day)
                      }
                      style={{
                        width: "34px",
                        height: "30px",
                        borderRadius: "6px",
                        border: isSelected
                          ? `1px solid ${theme.primary}`
                          : `1px solid ${theme.border}`,
                        background: isSelected
                          ? theme.primarySubtle
                          : "var(--bs-body-bg)",
                        color: theme.heading,
                        fontWeight: 700,
                        marginBottom: "12px",
                        fontSize: "12px",
                        opacity: isPastDay
                          ? 0.55
                          : 1,
                        cursor: isPastDay
                          ? "not-allowed"
                          : "pointer",
                      }}
                    >
                      {day.format("D")}
                    </button>

                    {!slots.length ? (
                      <div
                        style={{
                          background:
                            "var(--bs-secondary-bg)",
                          border:
                            `1px solid ${theme.border}`,
                          borderRadius: "8px",
                          color: theme.muted,
                          fontSize: "11px",
                          fontWeight: 600,
                          padding: "8px 6px",
                          minHeight: "40px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent:
                            "center",
                          lineHeight: 1.25,
                        }}
                      >
                        No Slots Available
                      </div>
                    ) : (
                      <div className="d-flex flex-column gap-2">
                        {slots.map((slot) => {
                          const isBooked =
                            Boolean(
                              slot.isBooked
                            );

                          const isActive =
                            selectedDate ===
                            dayKey &&
                            selectedSlot?.start ===
                            slot.start &&
                            selectedSlot?.end ===
                            slot.end &&
                            !isBooked;

                          return (
                            <button
                              key={`${slot.start}-${slot.end}`}
                              type="button"
                              className="slot-btn"
                              disabled={
                                isBooked ||
                                submitting
                              }
                              onClick={() =>
                                handleSlotPick(
                                  day,
                                  slot
                                )
                              }
                              title={
                                isBooked
                                  ? "Booked Slot"
                                  : "Select slot"
                              }
                              style={{
                                border: isBooked
                                  ? `1px dashed ${theme.dangerBorder}`
                                  : isActive
                                    ? `1px solid ${theme.primary}`
                                    : `1px solid ${theme.border}`,

                                background:
                                  isBooked
                                    ? theme.dangerBg
                                    : isActive
                                      ? theme.primarySubtle
                                      : "var(--bs-secondary-bg)",

                                color: isBooked
                                  ? theme.dangerText
                                  : isActive
                                    ? theme.primaryText
                                    : theme.muted,

                                borderRadius: "8px",
                                fontSize: "11px",
                                fontWeight: 700,
                                padding: "8px 6px",
                                lineHeight: 1.2,

                                cursor: isBooked
                                  ? "not-allowed"
                                  : "pointer",

                                opacity: isBooked
                                  ? 0.9
                                  : 1,
                              }}
                            >
                              <div>
                                {slot.label}
                              </div>

                              {isBooked ? (
                                <div
                                  style={{
                                    fontSize: "10px",
                                    marginTop: "4px",
                                  }}
                                >
                                  Booked Slot
                                </div>
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div
          className="mb-4"
          style={{
            ...styles.section,
            borderRadius: "12px",
          }}
        >
          <div className="d-flex align-items-center justify-content-between gap-3 flex-wrap">
            <div>
              <div
                style={{
                  color: theme.heading,
                  fontSize: "14px",
                  fontWeight: 700,
                }}
              >
                Custom Slot
              </div>

              <div
                style={{
                  color: theme.muted,
                  fontSize: "12px",
                }}
              >
                If you do not want to select a listed slot,
                set the start and end time manually here.
              </div>
            </div>

            <div className="d-flex align-items-center gap-2">
              <button
                type="button"
                aria-label="Enable custom slot"
                aria-pressed={useCustomSlot}
                onClick={toggleCustomSlot}
                disabled={submitting}
                style={{
                  width: "52px",
                  height: "30px",
                  border: "none",
                  borderRadius: "999px",

                  background: useCustomSlot
                    ? theme.primary
                    : "#94a3b8",

                  position: "relative",
                  padding: 0,

                  cursor: submitting
                    ? "not-allowed"
                    : "pointer",

                  opacity: submitting
                    ? 0.7
                    : 1,

                  transition:
                    "all 0.2s ease",

                  boxShadow:
                    "inset 0 0 0 1px rgba(15, 23, 42, 0.08)",
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    top: "3px",

                    left: useCustomSlot
                      ? "25px"
                      : "3px",

                    width: "24px",
                    height: "24px",
                    borderRadius: "50%",
                    background: "#fff",

                    boxShadow:
                      "0 2px 6px rgba(15, 23, 42, 0.22)",

                    transition:
                      "all 0.2s ease",
                  }}
                />
              </button>

              <button
                type="button"
                onClick={toggleCustomSlot}
                disabled={submitting}
                style={{
                  border: "none",
                  background: "transparent",
                  color: theme.heading,
                  fontSize: "13px",
                  fontWeight: 700,
                  padding: 0,

                  cursor: submitting
                    ? "not-allowed"
                    : "pointer",
                }}
              >
                Enable custom slot
              </button>
            </div>
          </div>

          {useCustomSlot ? (
            <div className="row g-3 mt-1">
              <div className="col-md-4">
                <label
                  className="form-label"
                  style={{
                    color: theme.muted,
                    fontSize: "12px",
                    fontWeight: 700,
                  }}
                >
                  Date
                </label>

                <input
                  type="date"
                  className="form-control theme-native-control"
                  value={selectedDate}
                  min={todayDubai.format(
                    "YYYY-MM-DD"
                  )}
                  onChange={
                    handleDateInputChange
                  }
                  disabled={submitting}
                  style={{
                    height: "38px",
                    borderRadius: "8px",
                    fontSize: "13px",
                  }}
                />
              </div>

              <div className="col-md-4">
                <label
                  className="form-label"
                  style={{
                    color: theme.muted,
                    fontSize: "12px",
                    fontWeight: 700,
                  }}
                >
                  Start Time
                </label>

                <input
                  type="time"
                  className="form-control theme-native-control"
                  value={customStartTime}
                  disabled={submitting}
                  onChange={(event) => {
                    setCustomStartTime(
                      event.target.value
                    );

                    setSubmitError("");
                  }}
                  style={{
                    height: "38px",
                    borderRadius: "8px",
                    fontSize: "13px",
                  }}
                />
              </div>

              <div className="col-md-4">
                <label
                  className="form-label"
                  style={{
                    color: theme.muted,
                    fontSize: "12px",
                    fontWeight: 700,
                  }}
                >
                  End Time
                </label>

                <input
                  type="time"
                  className="form-control theme-native-control"
                  value={customEndTime}
                  disabled={submitting}
                  onChange={(event) => {
                    setCustomEndTime(
                      event.target.value
                    );

                    setSubmitError("");
                  }}
                  style={{
                    height: "38px",
                    borderRadius: "8px",
                    fontSize: "13px",
                  }}
                />
              </div>
            </div>
          ) : null}
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
              height: "40px",
              borderRadius: "999px",
              background:
                theme.secondaryBtnBg,
              color:
                theme.secondaryBtnText,
              fontWeight: 700,
              border:
                `1px solid ${theme.border}`,
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
              height: "40px",
              borderRadius: "999px",

              background: canSubmit
                ? theme.primary
                : "var(--bs-secondary-bg)",

              color: canSubmit
                ? "#fff"
                : theme.muted,

              fontWeight: 700,
              border: "none",
              fontSize: "13px",

              opacity: canSubmit
                ? 1
                : 0.7,

              cursor: canSubmit
                ? "pointer"
                : "not-allowed",
            }}
          >
            {submitting
              ? "Rescheduling..."
              : "Reschedule"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default RescheduleBookingModal;