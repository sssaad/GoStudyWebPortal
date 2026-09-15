import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import axios from "axios";
import Swal from "sweetalert2";
import { Icon } from "@iconify/react/dist/iconify.js";
import moment from "moment-timezone";
import { getAllBookings } from "../api/getAllBookings";
import { getToken } from "../api/getToken";

const RUN_STORED_PROCEDURE_URL =
  "https://api.learnyourlanguage.org/RestController_Thirdparty.php?view=runStoredProcedure";

const API_HEADERS = {
  projectid: "1",
  userid: "test",
  password: "test",
  "x-api-key": "abc123456789",
  "Content-Type": "application/json",
};

const DELETE_GROUP_SESSION_PROCEDURE =
  "sp_portal_delete_group_live_session";

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

const GroupBookingListLayer = () => {
  const TZ = "Asia/Dubai";

  const [rows, setRows] = useState([]);
  const [loading, setLoading] =
    useState(true);
  const [loadError, setLoadError] =
    useState("");

  const [searchTerm, setSearchTerm] =
    useState("");

  const [
    programmeFilter,
    setProgrammeFilter,
  ] = useState("");

  const [
    batchFilter,
    setBatchFilter,
  ] = useState("");

  const [
    statusFilter,
    setStatusFilter,
  ] = useState("");

  const [
    openProgrammeId,
    setOpenProgrammeId,
  ] = useState("");

  const [
    openBatchKey,
    setOpenBatchKey,
  ] = useState("");

  const [
    selectedSession,
    setSelectedSession,
  ] = useState(null);

  const [
    recordingModal,
    setRecordingModal,
  ] = useState(null);

  const [
    deletingSessionId,
    setDeletingSessionId,
  ] = useState("");

  const norm = (value) =>
    String(value ?? "")
      .trim()
      .toLowerCase();

  const cleanUrl = (value) =>
    String(value || "")
      .replace(/\\\//g, "/")
      .trim();

  const cleanTimezone = (
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

  const getRole = (item) =>
    norm(
      item?.group_user_role
    ).replace(
      /[\s-]+/g,
      "_"
    );

  const isAssistantRow = (item) =>
    getRole(item) ===
    "assistant_teacher";

  const getProgrammeId = (item) =>
    item?.group_programme_id ??
    "";

  const getProgrammeName = (
    item
  ) =>
    item?.group_programme_name ||
    "Untitled Programme";

  const getBatchId = (item) =>
    item?.group_batch_id ?? "";

  const getSessionId = (item) =>
    item?.group_live_session_id ??
    "";

  const getTeacherId = (item) =>
    item?.teacherid ?? "";

  const getTeacherName = (item) =>
    item?.teachername ||
    "Teacher N/A";

  const getStudentId = (item) =>
    item?.studentid ?? "";

  const getStudentName = (item) =>
    item?.studentname ||
    "Student N/A";

  const getBookingId = (item) =>
    item?.bookingid ??
    item?.booking_id ??
    "";

  const uniqueBy = (
    items,
    getKey
  ) => {
    const map = new Map();

    (items || []).forEach(
      (item) => {
        const key = String(
          getKey(item) ?? ""
        ).trim();

        if (
          key &&
          !map.has(key)
        ) {
          map.set(
            key,
            item
          );
        }
      }
    );

    return Array.from(
      map.values()
    );
  };

  const parseSessionDateTime = (
    item,
    type = "start"
  ) => {
    /*
     * First preference:
     * bookteacher date/time.
     *
     * These values are stored in the
     * student's booking timezone.
     */
    const bookingDate =
      item?.bookdate || "";

    const bookingTime =
      type === "end"
        ? item?.slot_end || ""
        : item?.slot_start || "";

    const hasBookteacherDateTime =
      Boolean(bookingDate) &&
      Boolean(bookingTime);

    /*
     * Fallback:
     * official group session fields.
     */
    const date =
      hasBookteacherDateTime
        ? bookingDate
        : item?.group_session_date ||
        item?.booking_date ||
        "";

    const time =
      hasBookteacherDateTime
        ? bookingTime
        : type === "end"
          ? item?.group_session_end ||
          item?.booking_end_time ||
          "00:00:00"
          : item?.group_session_start ||
          item?.booking_start_time ||
          "00:00:00";

    if (!date) {
      return null;
    }

    const sourceTimezone =
      hasBookteacherDateTime
        ? getStudentTimezone(item)
        : TZ;

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
      `${date} ${time}`,
      formats,
      true,
      sourceTimezone
    );

    if (!parsed.isValid()) {
      parsed = moment.tz(
        `${date} ${time}`,
        formats,
        sourceTimezone
      );
    }

    if (!parsed.isValid()) {
      return null;
    }

    /*
     * Portal always displays Asia/Dubai.
     */
    return parsed.tz(TZ);
  };
  const getRecordingUrl = (
    sessionRows
  ) => {
    /*
     * Recording can exist on any row:
     * main teacher, assistant teacher
     * or student booking row.
     */
    const rowWithRecording =
      (
        sessionRows || []
      ).find((item) =>
        Boolean(
          cleanUrl(
            item
              ?.recording_s3_url
          )
        )
      );

    return rowWithRecording
      ? cleanUrl(
        rowWithRecording
          .recording_s3_url
      )
      : "";
  };

  const getSessionStatus = (
    sessionRows,
    recordingUrl
  ) => {
    const safeRows =
      Array.isArray(
        sessionRows
      )
        ? sessionRows
        : [];

    const firstRow =
      safeRows[0] || {};

    /*
     * IMPORTANT:
     *
     * Recording is the strongest proof
     * that the class happened.
     *
     * This must run before checking
     * is_cancelled or DB status.
     *
     * Therefore:
     * recording + cancelled flag
     * still becomes Completed.
     */
    if (recordingUrl) {
      return "Completed";
    }

    const start =
      parseSessionDateTime(
        firstRow,
        "start"
      );

    let end =
      parseSessionDateTime(
        firstRow,
        "end"
      );

    /*
     * Do not cancel the entire group
     * session because only one duplicate
     * student/assistant row is cancelled.
     *
     * Session is treated as explicitly
     * cancelled only when every returned
     * role row says cancelled.
     */
    const allRowsCancelled =
      safeRows.length > 0 &&
      safeRows.every(
        (row) =>
          Number(
            row?.is_cancelled ||
            0
          ) === 1 ||
          norm(
            row
              ?.group_session_status
          ) ===
          "cancelled"
      );

    /*
     * Invalid or missing date handling.
     */
    if (
      !start?.isValid?.()
    ) {
      const apiStatuses =
        safeRows.map(
          (row) =>
            norm(
              row
                ?.group_session_status
            )
        );

      if (
        apiStatuses.some(
          (status) =>
            [
              "completed",
              "missed",
            ].includes(
              status
            )
        )
      ) {
        /*
         * No recording exists,
         * therefore elapsed API status
         * is shown as Missed.
         */
        return "Missed";
      }

      return allRowsCancelled
        ? "Cancelled"
        : "Upcoming";
    }

    /*
     * Use one-hour fallback if
     * session end is missing.
     */
    if (
      !end?.isValid?.()
    ) {
      end = start
        .clone()
        .add(
          1,
          "hour"
        );
    }

    const now =
      moment.tz(TZ);

    /*
     * Future session.
     */
    if (
      now.isBefore(start)
    ) {
      return allRowsCancelled
        ? "Cancelled"
        : "Upcoming";
    }

    /*
     * Currently running session.
     */
    if (
      now.isSameOrAfter(
        start
      ) &&
      now.isSameOrBefore(
        end
      )
    ) {
      return allRowsCancelled
        ? "Cancelled"
        : "Ongoing";
    }

    /*
     * Final requested rule:
     *
     * Past + recording:
     * Completed
     *
     * Past + no recording:
     * Missed
     *
     * Recording case was already
     * returned at the top.
     */
    return "Missed";
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
        "unpaid",
        "not_paid",
        "due",
      ].includes(status)
    ) {
      return "Unpaid";
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
        "refunded",
        "partially_refunded",
        "partial_refund",
      ].includes(status)
    ) {
      return "Refunded";
    }

    if (
      [
        "failed",
        "declined",
        "cancelled",
        "canceled",
      ].includes(status)
    ) {
      return "Failed";
    }

    return "";
  };

  const getPaymentStatus = (
    item
  ) => {
    const bookingStatus =
      normalizePaymentStatus(
        item?.payment_status
      );

    const groupStatus =
      normalizePaymentStatus(
        item
          ?.group_payment_status
      );

    /*
     * Failed/refunded gateway state
     * is considered final.
     */
    if (
      [
        "Refunded",
        "Failed",
      ].includes(
        groupStatus
      )
    ) {
      return groupStatus;
    }

    /*
     * On booking page,
     * bookteacher.payment_status
     * is student-level primary status.
     *
     * Example:
     * payment_status = Unpaid
     * group_payment_status = pending
     *
     * Result must be Unpaid.
     */
    if (bookingStatus) {
      return bookingStatus;
    }

    /*
     * Group status is fallback.
     */
    if (groupStatus) {
      return groupStatus;
    }

    return "Unpaid";
  };

  const getPaymentAmount = (
    item
  ) => {
    const groupAmount =
      Number(
        item
          ?.group_payment_amount
      );

    if (
      item
        ?.group_payment_amount !==
      null &&
      item
        ?.group_payment_amount !==
      undefined &&
      String(
        item
          .group_payment_amount
      ).trim() !== "" &&
      Number.isFinite(
        groupAmount
      )
    ) {
      return groupAmount;
    }

    const bookingAmount =
      Number(
        item?.booking_amount ??
        item?.amount ??
        0
      );

    return Number.isFinite(
      bookingAmount
    )
      ? bookingAmount
      : 0;
  };

  const getPaymentSource = (
    item
  ) =>
    item
      ?.group_payment_source ||
    item?.payment_origin ||
    item?.payment_type ||
    "-";

  const formatMoney = (
    value
  ) =>
    `AED ${Number(
      value || 0
    ).toFixed(2)}`;

  const formatDate = (
    item
  ) =>
    parseSessionDateTime(
      item,
      "start"
    )?.format(
      "DD MMM YYYY"
    ) || "-";

  const formatTime = (
    item,
    type
  ) =>
    parseSessionDateTime(
      item,
      type
    )?.format(
      "hh:mm A"
    ) || "-";

  const getStatusOrder = (
    status
  ) => {
    const value =
      norm(status);

    /*
     * Required sorting:
     *
     * 1. Ongoing
     * 2. Upcoming/new
     * 3. Completed/Missed
     * 4. Cancelled
     */
    if (
      value === "ongoing"
    ) {
      return 0;
    }

    if (
      value === "upcoming"
    ) {
      return 1;
    }

    if (
      [
        "completed",
        "missed",
      ].includes(value)
    ) {
      return 2;
    }

    if (
      value === "cancelled"
    ) {
      return 3;
    }

    return 4;
  };

  const sortSessions = (
    first,
    second
  ) => {
    const firstOrder =
      getStatusOrder(
        first?.status
      );

    const secondOrder =
      getStatusOrder(
        second?.status
      );

    if (
      firstOrder !==
      secondOrder
    ) {
      return (
        firstOrder -
        secondOrder
      );
    }

    const firstTime =
      first?.rawDate
        ?.valueOf?.() ||
      0;

    const secondTime =
      second?.rawDate
        ?.valueOf?.() ||
      0;

    /*
     * Upcoming:
     * nearest date first.
     *
     * Completed/Missed:
     * latest passed date first.
     */
    return firstOrder <= 1
      ? firstTime -
      secondTime
      : secondTime -
      firstTime;
  };

  const getCollectionSortMeta = (
    sessions = []
  ) => {
    const activeTimes =
      sessions
        .filter(
          (session) =>
            [
              "Ongoing",
              "Upcoming",
            ].includes(
              session.status
            )
        )
        .map(
          (session) =>
            session.rawDate
              ?.valueOf?.() ||
            0
        )
        .filter(Boolean);

    const pastTimes =
      sessions
        .filter(
          (session) =>
            [
              "Completed",
              "Missed",
              "Cancelled",
            ].includes(
              session.status
            )
        )
        .map(
          (session) =>
            session.rawDate
              ?.valueOf?.() ||
            0
        )
        .filter(Boolean);

    return {
      hasActive:
        activeTimes.length >
        0,

      nextActiveTime:
        activeTimes.length
          ? Math.min(
            ...activeTimes
          )
          : 0,

      latestPastTime:
        pastTimes.length
          ? Math.max(
            ...pastTimes
          )
          : 0,
    };
  };

  const sortCollections = (
    first,
    second
  ) => {
    /*
     * Programmes/batches containing
     * new sessions come first.
     */
    if (
      first.hasActive !==
      second.hasActive
    ) {
      return first.hasActive
        ? -1
        : 1;
    }

    /*
     * Active collections:
     * nearest upcoming first.
     */
    if (first.hasActive) {
      return (
        first.nextActiveTime -
        second.nextActiveTime
      );
    }

    /*
     * Past-only collections:
     * latest past first.
     */
    return (
      second.latestPastTime -
      first.latestPastTime
    );
  };

  const extractRows = (
    response
  ) => {
    if (
      Array.isArray(
        response
      )
    ) {
      return response;
    }

    if (
      Array.isArray(
        response?.data
      )
    ) {
      return response.data;
    }

    if (
      Array.isArray(
        response
          ?.getall_bookings
      )
    ) {
      return response
        .getall_bookings;
    }

    if (
      Array.isArray(
        response
          ?.getallbookings
      )
    ) {
      return response
        .getallbookings;
    }

    return [];
  };

  const fetchGroupBookings =
    useCallback(async () => {
      setLoading(true);
      setLoadError("");

      try {
        const response =
          await getAllBookings();

        const groupRows =
          extractRows(
            response
          ).filter(
            (item) =>
              Number(
                item
                  ?.is_group_booking ||
                0
              ) === 1 &&
              Number(
                item?.deleted ||
                0
              ) !== 1
          );

        setRows(groupRows);
      } catch (error) {
        console.error(
          "Group bookings loading failed:",
          error
        );

        setRows([]);

        setLoadError(
          "Group bookings could not be loaded. Please check the network and try again."
        );
      } finally {
        setLoading(false);
      }
    }, []);

  useEffect(() => {
    fetchGroupBookings();
  }, [fetchGroupBookings]);

  useEffect(() => {
    const closeOnEscape = (
      event
    ) => {
      if (
        event.key ===
        "Escape"
      ) {
        setSelectedSession(
          null
        );

        setRecordingModal(
          null
        );
      }
    };

    window.addEventListener(
      "keydown",
      closeOnEscape
    );

    return () =>
      window.removeEventListener(
        "keydown",
        closeOnEscape
      );
  }, []);

  useEffect(() => {
    if (
      !selectedSession &&
      !recordingModal
    ) {
      return undefined;
    }

    const previousOverflow =
      document.body.style
        .overflow;

    document.body.style
      .overflow = "hidden";

    return () => {
      document.body.style
        .overflow =
        previousOverflow;
    };
  }, [
    selectedSession,
    recordingModal,
  ]);

  const programmes =
    useMemo(() => {
      const programmeMap =
        new Map();

      rows.forEach(
        (row) => {
          const programmeKey =
            String(
              getProgrammeId(
                row
              ) ||
              getProgrammeName(
                row
              )
            );

          const batchKey =
            String(
              getBatchId(
                row
              ) ||
              "no-batch"
            );

          const sessionKey =
            String(
              getSessionId(
                row
              ) ||
              [
                row
                  ?.group_session_title,
                row
                  ?.group_session_date,
                row
                  ?.group_session_start,
              ].join("|")
            );

          if (
            !programmeMap.has(
              programmeKey
            )
          ) {
            programmeMap.set(
              programmeKey,
              {
                id:
                  programmeKey,

                name:
                  getProgrammeName(
                    row
                  ),

                description:
                  row
                    ?.group_programme_description ||
                  "",

                stage:
                  row
                    ?.group_programme_stage ||
                  "-",

                price:
                  Number(
                    row
                      ?.group_programme_price ||
                    0
                  ),

                batchesMap:
                  new Map(),
              }
            );
          }

          const programme =
            programmeMap.get(
              programmeKey
            );

          if (
            !programme.batchesMap.has(
              batchKey
            )
          ) {
            programme.batchesMap.set(
              batchKey,
              {
                id:
                  batchKey,

                label:
                  row
                    ?.group_batch_label ||
                  `Batch #${batchKey}`,

                sessionsMap:
                  new Map(),
              }
            );
          }

          const batch =
            programme.batchesMap.get(
              batchKey
            );

          if (
            !batch.sessionsMap.has(
              sessionKey
            )
          ) {
            batch.sessionsMap.set(
              sessionKey,
              {
                id:
                  sessionKey,
                rows: [],
              }
            );
          }

          batch.sessionsMap
            .get(
              sessionKey
            )
            .rows.push(row);
        }
      );

      return Array.from(
        programmeMap.values()
      )
        .map(
          (programme) => {
            const batches =
              Array.from(
                programme.batchesMap.values()
              )
                .map(
                  (batch) => {
                    const sessions =
                      Array.from(
                        batch.sessionsMap.values()
                      )
                        .map(
                          (
                            sessionGroup
                          ) => {
                            const sessionRows =
                              sessionGroup.rows;

                            const assistantRows =
                              sessionRows.filter(
                                isAssistantRow
                              );

                            const normalRows =
                              sessionRows.filter(
                                (
                                  item
                                ) =>
                                  !isAssistantRow(
                                    item
                                  )
                              );

                            /*
                             * Prefer main teacher/student
                             * row for title/date/time.
                             */
                            const representativeRow =
                              normalRows[0] ||
                              sessionRows[0] ||
                              {};

                            /*
                             * Main teachers are read
                             * only from non-assistant rows.
                             */
                            const mainTeachers =
                              uniqueBy(
                                normalRows,
                                (
                                  item
                                ) =>
                                  getTeacherId(
                                    item
                                  ) ||
                                  getTeacherName(
                                    item
                                  )
                              ).map(
                                (
                                  item
                                ) => ({
                                  id:
                                    getTeacherId(
                                      item
                                    ),

                                  name:
                                    getTeacherName(
                                      item
                                    ),
                                })
                              );

                            /*
                             * Assistant teachers are read
                             * from group_user_role.
                             */
                            const assistants =
                              uniqueBy(
                                assistantRows,
                                (
                                  item
                                ) =>
                                  getTeacherId(
                                    item
                                  ) ||
                                  getTeacherName(
                                    item
                                  )
                              ).map(
                                (
                                  item
                                ) => ({
                                  id:
                                    getTeacherId(
                                      item
                                    ),

                                  name:
                                    getTeacherName(
                                      item
                                    ),
                                })
                              );

                            /*
                             * Assistant rows repeat the
                             * same student.
                             *
                             * Therefore use non-assistant
                             * rows for student/payment data.
                             */
                            const studentSourceRows =
                              normalRows.length
                                ? normalRows
                                : sessionRows;

                            const students =
                              uniqueBy(
                                studentSourceRows,
                                (
                                  item
                                ) =>
                                  getStudentId(
                                    item
                                  ) ||
                                  getStudentName(
                                    item
                                  )
                              ).map(
                                (
                                  item
                                ) => ({
                                  id:
                                    getStudentId(
                                      item
                                    ),

                                  name:
                                    getStudentName(
                                      item
                                    ),

                                  image:
                                    item
                                      ?.studentimage ||
                                    "assets/images/user.png",

                                  bookingId:
                                    getBookingId(
                                      item
                                    ),

                                  paymentId:
                                    item
                                      ?.group_payment_id ??
                                    "",

                                  paymentStatus:
                                    getPaymentStatus(
                                      item
                                    ),

                                  paymentType:
                                    item
                                      ?.payment_type ||
                                    "-",

                                  paymentSource:
                                    getPaymentSource(
                                      item
                                    ),

                                  bookingType:
                                    item
                                      ?.booking_type ||
                                    "-",

                                  amount:
                                    getPaymentAmount(
                                      item
                                    ),
                                })
                              );

                            const recordingUrl =
                              getRecordingUrl(
                                sessionRows
                              );

                            const rawDate =
                              parseSessionDateTime(
                                representativeRow,
                                "start"
                              );

                            const paymentSummary =
                              students.reduce(
                                (
                                  summary,
                                  student
                                ) => {
                                  const key =
                                    norm(
                                      student.paymentStatus
                                    ) ||
                                    "unpaid";

                                  summary[
                                    key
                                  ] =
                                    (summary[
                                      key
                                    ] ||
                                      0) +
                                    1;

                                  return summary;
                                },
                                {}
                              );

                            return {
                              id:
                                sessionGroup.id,

                              title:
                                representativeRow
                                  ?.group_session_title ||
                                "Group Session",

                              subject:
                                representativeRow
                                  ?.subjectname ||
                                "-",

                              date:
                                formatDate(
                                  representativeRow
                                ),

                              startTime:
                                formatTime(
                                  representativeRow,
                                  "start"
                                ),

                              endTime:
                                formatTime(
                                  representativeRow,
                                  "end"
                                ),

                              rawDate,

                              capacity:
                                Number(
                                  representativeRow
                                    ?.group_session_capacity ||
                                  0
                                ),

                              mainTeachers,
                              assistants,
                              students,
                              paymentSummary,
                              recordingUrl,

                              hasRecording:
                                Boolean(
                                  recordingUrl
                                ),

                              status:
                                getSessionStatus(
                                  sessionRows,
                                  recordingUrl
                                ),
                            };
                          }
                        )
                        .sort(
                          sortSessions
                        );

                    const batchStudents =
                      new Set();

                    sessions.forEach(
                      (
                        session
                      ) => {
                        session.students.forEach(
                          (
                            student
                          ) =>
                            batchStudents.add(
                              String(
                                student.id ||
                                student.name
                              )
                            )
                        );
                      }
                    );

                    return {
                      id:
                        batch.id,

                      label:
                        batch.label,

                      sessions,

                      studentCount:
                        batchStudents.size,

                      ...getCollectionSortMeta(
                        sessions
                      ),
                    };
                  }
                )
                .sort(
                  sortCollections
                );

            const programmeStudents =
              new Set();

            let totalSessions =
              0;

            let completed =
              0;

            let missed =
              0;

            batches.forEach(
              (batch) => {
                totalSessions +=
                  batch.sessions
                    .length;

                batch.sessions.forEach(
                  (
                    session
                  ) => {
                    if (
                      session.status ===
                      "Completed"
                    ) {
                      completed +=
                        1;
                    }

                    if (
                      session.status ===
                      "Missed"
                    ) {
                      missed +=
                        1;
                    }

                    session.students.forEach(
                      (
                        student
                      ) =>
                        programmeStudents.add(
                          String(
                            student.id ||
                            student.name
                          )
                        )
                    );
                  }
                );
              }
            );

            const programmeSessions =
              batches.flatMap(
                (batch) =>
                  batch.sessions
              );

            return {
              id:
                programme.id,

              name:
                programme.name,

              description:
                programme.description,

              stage:
                programme.stage,

              price:
                Number.isFinite(
                  programme.price
                )
                  ? programme.price
                  : 0,

              batches,

              totalBatches:
                batches.length,

              totalSessions,

              studentCount:
                programmeStudents.size,

              completed,
              missed,

              ...getCollectionSortMeta(
                programmeSessions
              ),
            };
          }
        )
        .sort(
          sortCollections
        );
    }, [rows]);

  const programmeOptions =
    useMemo(
      () =>
        programmes.map(
          (
            programme
          ) => ({
            value:
              programme.id,

            label:
              programme.name,
          })
        ),
      [programmes]
    );

  const batchOptions =
    useMemo(() => {
      const options = [];

      programmes.forEach(
        (programme) => {
          programme.batches.forEach(
            (batch) => {
              options.push({
                value:
                  `${programme.id}|${batch.id}`,

                programmeId:
                  programme.id,

                label:
                  `${programme.name} - ${batch.label}`,
              });
            }
          );
        }
      );

      return options;
    }, [programmes]);

  const filteredProgrammes =
    useMemo(() => {
      const search =
        norm(searchTerm);

      return programmes
        .map(
          (
            programme
          ) => {
            if (
              programmeFilter &&
              String(
                programme.id
              ) !==
              String(
                programmeFilter
              )
            ) {
              return null;
            }

            const batches =
              programme.batches
                .map(
                  (
                    batch
                  ) => {
                    const currentBatchKey =
                      `${programme.id}|${batch.id}`;

                    if (
                      batchFilter &&
                      batchFilter !==
                      currentBatchKey
                    ) {
                      return null;
                    }

                    const sessions =
                      batch.sessions.filter(
                        (
                          session
                        ) => {
                          if (
                            statusFilter &&
                            norm(
                              session.status
                            ) !==
                            norm(
                              statusFilter
                            )
                          ) {
                            return false;
                          }

                          const searchableText =
                            [
                              programme.name,
                              programme.stage,
                              batch.label,
                              session.title,
                              session.subject,
                              session.date,
                              session.status,

                              ...session.mainTeachers.map(
                                (
                                  teacher
                                ) =>
                                  teacher.name
                              ),

                              ...session.assistants.map(
                                (
                                  teacher
                                ) =>
                                  teacher.name
                              ),

                              ...session.students.map(
                                (
                                  student
                                ) =>
                                  student.name
                              ),
                            ]
                              .join(
                                " "
                              )
                              .toLowerCase();

                          return (
                            !search ||
                            searchableText.includes(
                              search
                            )
                          );
                        }
                      );

                    if (
                      !sessions.length
                    ) {
                      return null;
                    }

                    return {
                      ...batch,
                      sessions,

                      ...getCollectionSortMeta(
                        sessions
                      ),
                    };
                  }
                )
                .filter(
                  Boolean
                )
                .sort(
                  sortCollections
                );

            if (
              !batches.length
            ) {
              return null;
            }

            return {
              ...programme,
              batches,

              ...getCollectionSortMeta(
                batches.flatMap(
                  (batch) =>
                    batch.sessions
                )
              ),
            };
          }
        )
        .filter(Boolean)
        .sort(
          sortCollections
        );
    }, [
      programmes,
      searchTerm,
      programmeFilter,
      batchFilter,
      statusFilter,
    ]);

  const totals =
    useMemo(() => {
      const students =
        new Set();

      let batches = 0;
      let sessions = 0;
      let completed = 0;
      let missed = 0;

      programmes.forEach(
        (programme) => {
          batches +=
            programme.totalBatches;

          sessions +=
            programme.totalSessions;

          completed +=
            programme.completed;

          missed +=
            programme.missed;

          programme.batches.forEach(
            (batch) =>
              batch.sessions.forEach(
                (
                  session
                ) =>
                  session.students.forEach(
                    (
                      student
                    ) =>
                      students.add(
                        String(
                          student.id ||
                          student.name
                        )
                      )
                  )
              )
          );
        }
      );

      return {
        programmes:
          programmes.length,

        batches,
        sessions,

        students:
          students.size,

        completed,
        missed,
      };
    }, [programmes]);

  useEffect(() => {
    if (
      programmeFilter
    ) {
      setOpenProgrammeId(
        String(
          programmeFilter
        )
      );
    }
  }, [programmeFilter]);

  useEffect(() => {
    if (!batchFilter) {
      return;
    }

    const [
      programmeId,
      batchId,
    ] =
      batchFilter.split(
        "|"
      );

    setOpenProgrammeId(
      programmeId
    );

    setOpenBatchKey(
      `${programmeId}|${batchId}`
    );
  }, [batchFilter]);

  const statusClass = (
    status
  ) =>
    `gb-status gb-status-${norm(
      status
    )}`;

  const paymentClass = (
    status
  ) => {
    const value =
      norm(status);

    if (
      [
        "paid",
        "free",
      ].includes(value)
    ) {
      return "gb-payment gb-payment-paid";
    }

    if (
      [
        "failed",
        "refunded",
      ].includes(value)
    ) {
      return "gb-payment gb-payment-failed";
    }

    return "gb-payment gb-payment-pending";
  };

  const openRecording = (
    session
  ) => {
    if (
      !session?.recordingUrl
    ) {
      return;
    }

    setRecordingModal({
      url:
        session.recordingUrl,

      title:
        session.title,

      date:
        session.date,
    });
  };

  const canDeleteSession = (
    session
  ) => {
    if (!session) {
      return false;
    }

    /*
     * Delete only upcoming sessions.
     */
    if (
      norm(session.status) !==
      "upcoming"
    ) {
      return false;
    }

    /*
     * Recording exists means we do not
     * allow this delete flow.
     */
    if (session.hasRecording) {
      return false;
    }

    const sessionId =
      Number(session.id);

    return (
      Number.isInteger(
        sessionId
      ) &&
      sessionId > 0
    );
  };


  const handleDeleteSession =
    async (
      session,
      programme,
      batch
    ) => {
      if (
        !canDeleteSession(
          session
        )
      ) {
        await Swal.fire({
          icon: "warning",
          title:
            "Session Cannot Be Deleted",
          text:
            "Only upcoming sessions without a recording can be deleted.",
          confirmButtonColor:
            "#487fff",
        });

        return;
      }

      const sessionId =
        Number(session.id);

      const batchId =
        Number(batch?.id);

      if (
        !sessionId ||
        !batchId
      ) {
        await Swal.fire({
          icon: "error",
          title:
            "Missing Session Data",
          text:
            "Session ID or Batch ID is missing.",
          confirmButtonColor:
            "#dc2626",
        });

        return;
      }

      const teacherNames =
        session.mainTeachers
          ?.map(
            (teacher) =>
              teacher.name
          )
          .filter(Boolean)
          .join(", ") ||
        "N/A";

      const confirmation =
        await Swal.fire({
          icon: "warning",

          title:
            "Delete Group Session?",

          html: `
            <div style="text-align:left; line-height:1.8;">
              <div>
                <strong>Programme:</strong>
                ${programme?.name || "-"}
              </div>

              <div>
                <strong>Batch:</strong>
                ${batch?.label || batchId}
              </div>

              <div>
                <strong>Session:</strong>
                ${session.title || "-"}
              </div>

              <div>
                <strong>Date:</strong>
                ${session.date || "-"}
              </div>

              <div>
                <strong>Time:</strong>
                ${session.startTime || "-"}
                -
                ${session.endTime || "-"}
              </div>

              <div>
                <strong>Teacher:</strong>
                ${teacherNames}
              </div>

              <div>
                <strong>Students:</strong>
                ${session.students
              ?.length || 0
            }
              </div>

              <div style="
                margin-top:12px;
                color:#dc2626;
                font-weight:700;
              ">
                This will delete all bookings for this specific session and reset its class data.
The session setup and other recurring sessions will remain unchanged.
              </div>
            </div>
          `,

          showCancelButton: true,

          confirmButtonText:
            "Yes, Delete",

          cancelButtonText:
            "Cancel",

          confirmButtonColor:
            "#dc2626",

          cancelButtonColor:
            "#64748b",

          reverseButtons: true,
        });

      if (
        !confirmation.isConfirmed
      ) {
        return;
      }

      setDeletingSessionId(
        String(sessionId)
      );

      try {
        /*
         * Get portal API token.
         */
        const tokenResponse =
          await getToken();

        const token =
          resolveToken(
            tokenResponse
          );

        if (!token) {
          throw new Error(
            "API token could not be generated."
          );
        }

        /*
         * Call stored procedure.
         *
         * SP parameters:
         *
         * 1. p_group_live_session_id
         * 2. p_group_batch_id
         */
        const response =
          await axios.post(
            RUN_STORED_PROCEDURE_URL,
            {
              procedureName:
                DELETE_GROUP_SESSION_PROCEDURE,

              parameters: [
                sessionId,
                batchId,
              ],
            },
            {
              headers: {
                ...API_HEADERS,
                token,
              },
            }
          );

        const responseData =
          response?.data || {};

        if (
          Number(
            responseData
              ?.statusCode
          ) !== 200
        ) {
          throw new Error(
            responseData
              ?.message ||
            "Group session could not be deleted."
          );
        }

        /*
         * Our SP returns SELECT:
         *
         * success
         * message
         * group_live_session_id
         * group_batch_id
         * deleted_bookings
         * affected_payments
         * etc.
         */
        let procedureResult =
          null;

        if (
          Array.isArray(
            responseData?.data
          )
        ) {
          procedureResult =
            responseData
              .data[0] ||
            null;
        } else if (
          Array.isArray(
            responseData?.result
          )
        ) {
          procedureResult =
            responseData
              .result[0] ||
            null;
        }

        if (
          procedureResult &&
          procedureResult
            ?.success !==
          undefined &&
          Number(
            procedureResult
              .success
          ) !== 1
        ) {
          throw new Error(
            procedureResult
              ?.message ||
            "Group session delete failed."
          );
        }

        /*
         * Close details modal if this
         * same session is open.
         */
        if (
          String(
            selectedSession?.id ||
            ""
          ) ===
          String(sessionId)
        ) {
          setSelectedSession(
            null
          );
        }

        /*
         * Reload complete group list.
         */
        await fetchGroupBookings();

        await Swal.fire({
          icon: "success",
          title:
            "Session Deleted",
          text:
            procedureResult
              ?.message ||
            "Group session bookings deleted successfully.",
          timer: 1800,
          timerProgressBar:
            true,
          showConfirmButton:
            false,
        });
      } catch (error) {
        console.error(
          "Delete group session error:",
          error
        );

        const apiMessage =
          error?.response
            ?.data?.message ||
          error?.response
            ?.data?.error ||
          error?.message ||
          "Group session could not be deleted.";

        await Swal.fire({
          icon: "error",
          title:
            "Delete Failed",
          text:
            apiMessage,
          confirmButtonColor:
            "#dc2626",
        });
      } finally {
        setDeletingSessionId(
          ""
        );
      }
    };

  const resetFilters = () => {
    setSearchTerm("");
    setProgrammeFilter("");
    setBatchFilter("");
    setStatusFilter("");
  };

  if (loading) {
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
            border: "6px solid #e0e0e0",
            borderTop: "6px solid #45B369",
            borderRadius: "50%",
            animation: "spin 1s linear infinite",
          }}
        />

        <style>
          {`
          @keyframes spin {
            0% {
              transform: rotate(0deg);
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
    <div className="gb-page">
      <style>
        {`
          .gb-page {
            --gb-surface: #ffffff;
            --gb-surface-soft: #f8fafc;
            --gb-surface-muted: #f1f5f9;
            --gb-border: #e2e8f0;
            --gb-text: #0f172a;
            --gb-muted: #64748b;
            --gb-primary: #487fff;
            --gb-primary-soft: rgba(72, 127, 255, 0.1);
            --gb-shadow: 0 14px 36px rgba(15, 23, 42, 0.07);
            color: var(--gb-text);
          }

          html[data-theme="dark"] .gb-page,
          body[data-theme="dark"] .gb-page,
          [data-bs-theme="dark"] .gb-page,
          body.dark-theme .gb-page,
          body.dark .gb-page,
          .dark .gb-page {
            --gb-surface: #101828;
            --gb-surface-soft: #172033;
            --gb-surface-muted: #1d293d;
            --gb-border: #2b3a52;
            --gb-text: #f8fafc;
            --gb-muted: #94a3b8;
            --gb-primary-soft: rgba(72, 127, 255, 0.18);
            --gb-shadow: 0 18px 45px rgba(0, 0, 0, 0.28);
          }

          .gb-page * {
            box-sizing: border-box;
          }

          .gb-loading {
            min-height: 360px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 14px;
          }

          .gb-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            flex-wrap: wrap;
            gap: 16px;
            margin-bottom: 18px;
          }

          .gb-title {
            margin: 0 0 4px;
            color: var(--gb-text);
            font-size: 24px;
            font-weight: 800;
          }

          .gb-muted {
            color: var(--gb-muted);
          }

          .gb-button {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            padding: 9px 13px;
            border: 1px solid var(--gb-primary);
            border-radius: 10px;
            background: var(--gb-primary-soft);
            color: var(--gb-primary);
            font-size: 12px;
            font-weight: 800;
            white-space: nowrap;
          }

                    .gb-action-buttons {
            display: flex;
            align-items: center;
            gap: 7px;
            flex-wrap: nowrap;
          }

          .gb-delete-button {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            padding: 9px 13px;
            border: 1px solid #dc2626;
            border-radius: 10px;
            background: rgba(220, 38, 38, 0.10);
            color: #dc2626;
            font-size: 12px;
            font-weight: 800;
            white-space: nowrap;
            transition: all 0.2s ease;
          }

          .gb-delete-button:hover:not(:disabled) {
            background: #dc2626;
            color: #ffffff;
          }

          .gb-delete-button:disabled,
          .gb-button:disabled {
            opacity: 0.55;
            cursor: not-allowed;
          }

          .gb-metrics {
            display: grid;
            grid-template-columns: repeat(6, 1fr);
            gap: 10px;
            margin-bottom: 18px;
          }

          .gb-metric {
            padding: 14px;
            border: 1px solid var(--gb-border);
            border-radius: 14px;
            background: var(--gb-surface);
            box-shadow: var(--gb-shadow);
          }

          .gb-metric strong {
            display: block;
            color: var(--gb-text);
            font-size: 20px;
          }

          .gb-metric span {
            color: var(--gb-muted);
            font-size: 10px;
            font-weight: 800;
            text-transform: uppercase;
          }

          .gb-filter-card {
            padding: 16px;
            margin-bottom: 18px;
            border: 1px solid var(--gb-border);
            border-radius: 16px;
            background: var(--gb-surface);
            box-shadow: var(--gb-shadow);
          }

          .gb-filter-grid {
            display: grid;
            grid-template-columns:
              minmax(240px, 1.5fr)
              repeat(3, minmax(170px, 1fr))
              auto;
            gap: 10px;
          }

          .gb-search {
            position: relative;
          }

          .gb-search-icon {
            position: absolute;
            top: 50%;
            left: 13px;
            color: var(--gb-muted);
            transform: translateY(-50%);
          }

          .gb-control {
            width: 100%;
            min-height: 44px;
            padding: 9px 12px;
            border: 1px solid var(--gb-border);
            border-radius: 11px;
            outline: none;
            background: var(--gb-surface-soft);
            color: var(--gb-text);
          }

          .gb-search .gb-control {
            padding-left: 39px;
          }

          .gb-control:focus {
            border-color: var(--gb-primary);
            box-shadow: 0 0 0 3px var(--gb-primary-soft);
          }

          .gb-control option {
            background: var(--gb-surface);
            color: var(--gb-text);
          }

          .gb-reset {
            min-height: 44px;
            padding: 0 15px;
            border: 1px solid var(--gb-border);
            border-radius: 11px;
            background: var(--gb-surface-soft);
            color: var(--gb-text);
            font-weight: 800;
          }

          .gb-programme {
            margin-bottom: 16px;
            overflow: hidden;
            border: 1px solid var(--gb-border);
            border-radius: 18px;
            background: var(--gb-surface);
            box-shadow: var(--gb-shadow);
          }

          .gb-programme-button,
          .gb-batch-button {
            width: 100%;
            border: 0;
            background: transparent;
            color: var(--gb-text);
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 15px;
            text-align: left;
          }

          .gb-programme-button {
            padding: 19px;
          }

          .gb-programme-main {
            display: flex;
            align-items: flex-start;
            gap: 13px;
            min-width: 0;
          }

          .gb-programme-icon {
            width: 46px;
            height: 46px;
            flex: none;
            border-radius: 14px;
            background: var(--gb-primary-soft);
            color: var(--gb-primary);
            display: flex;
            align-items: center;
            justify-content: center;
          }

          .gb-programme-name {
            margin: 0 0 4px;
            color: var(--gb-text);
            font-size: 17px;
            font-weight: 800;
          }

          .gb-programme-meta {
            display: flex;
            flex-wrap: wrap;
            gap: 7px 12px;
            color: var(--gb-muted);
            font-size: 12px;
          }

          .gb-description {
            max-width: 760px;
            margin: 7px 0 0;
            color: var(--gb-muted);
            font-size: 12px;
            line-height: 1.55;
          }

          .gb-counts {
            display: flex;
            gap: 7px;
          }

          .gb-count {
            min-width: 67px;
            padding: 7px 9px;
            border-radius: 10px;
            background: var(--gb-surface-soft);
            text-align: center;
          }

          .gb-count strong {
            display: block;
            color: var(--gb-text);
          }

          .gb-count span {
            color: var(--gb-muted);
            font-size: 9px;
            font-weight: 800;
            text-transform: uppercase;
          }

          .gb-chevron {
            color: var(--gb-muted);
            font-size: 22px;
            transition: transform 0.2s ease;
          }

          .gb-chevron.open {
            transform: rotate(180deg);
          }

          .gb-programme-body {
            padding: 0 17px 17px;
          }

          .gb-batch {
            margin-top: 10px;
            overflow: hidden;
            border: 1px solid var(--gb-border);
            border-radius: 14px;
            background: var(--gb-surface-soft);
          }

          .gb-batch-button {
            padding: 14px 15px;
          }

          .gb-batch-name {
            margin: 0;
            color: var(--gb-text);
            font-weight: 800;
          }

          .gb-small {
            margin-top: 3px;
            color: var(--gb-muted);
            font-size: 10px;
          }

          .gb-batch-body {
            padding: 0 13px 13px;
          }

          .gb-table-wrap {
            overflow-x: auto;
            border: 1px solid var(--gb-border);
            border-radius: 12px;
            background: var(--gb-surface);
          }

          .gb-table {
            width: 100%;
            min-width: 1320px;
            border-collapse: collapse;
          }

          .gb-table th {
            padding: 12px;
            border-bottom: 1px solid var(--gb-border);
            background: var(--gb-surface-muted);
            color: var(--gb-muted);
            font-size: 10px;
            font-weight: 800;
            text-transform: uppercase;
            white-space: nowrap;
          }

          .gb-table td {
            padding: 12px;
            border-bottom: 1px solid var(--gb-border);
            color: var(--gb-text);
            font-size: 12px;
            vertical-align: middle;
          }

          .gb-table tbody tr:last-child td {
            border-bottom: 0;
          }

          .gb-table tbody tr:hover {
            background: var(--gb-primary-soft);
          }

          .gb-strong {
            color: var(--gb-text);
            font-weight: 800;
          }

          .gb-status,
          .gb-payment {
            display: inline-flex;
            padding: 6px 9px;
            border-radius: 999px;
            font-size: 10px;
            font-weight: 800;
            white-space: nowrap;
          }

          .gb-status-upcoming,
          .gb-payment-pending {
            background: rgba(245, 158, 11, 0.14);
            color: #d97706;
          }

          .gb-status-ongoing {
            background: rgba(14, 165, 233, 0.14);
            color: #0284c7;
          }

          .gb-status-completed,
          .gb-payment-paid {
            background: rgba(34, 197, 94, 0.14);
            color: #16a34a;
          }

          .gb-status-missed,
          .gb-status-cancelled,
          .gb-payment-failed {
            background: rgba(239, 68, 68, 0.14);
            color: #dc2626;
          }

          .gb-payment-summary {
            display: flex;
            flex-wrap: wrap;
            gap: 5px;
            min-width: 130px;
          }

          .gb-payment-count {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 5px 8px;
            border-radius: 999px;
            font-size: 10px;
            font-weight: 800;
            white-space: nowrap;
          }

          .gb-payment-count.paid {
            background: rgba(34, 197, 94, 0.14);
            color: #16a34a;
          }

          .gb-payment-count.free {
            background: rgba(59, 130, 246, 0.14);
            color: #2563eb;
          }

          .gb-payment-count.unpaid,
          .gb-payment-count.pending {
            background: rgba(245, 158, 11, 0.14);
            color: #d97706;
          }

          .gb-payment-count.failed,
          .gb-payment-count.refunded {
            background: rgba(239, 68, 68, 0.14);
            color: #dc2626;
          }

          .gb-recording-button {
            display: inline-flex;
            align-items: center;
            gap: 5px;
            padding: 8px 10px;
            border: 1px solid #7c3aed;
            border-radius: 9px;
            background: rgba(124, 58, 237, 0.11);
            color: #7c3aed;
            font-size: 11px;
            font-weight: 800;
            white-space: nowrap;
          }

          .gb-no-recording {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            color: #dc2626;
            font-size: 10px;
            font-weight: 800;
            white-space: nowrap;
          }

          .gb-avatars {
            display: flex;
            align-items: center;
          }

          .gb-avatar {
            width: 30px;
            height: 30px;
            margin-left: -7px;
            border: 2px solid var(--gb-surface);
            border-radius: 50%;
            object-fit: cover;
          }

          .gb-avatar:first-child {
            margin-left: 0;
          }

          .gb-student-count {
            margin-left: 7px;
            color: var(--gb-muted);
            font-size: 11px;
            font-weight: 800;
            white-space: nowrap;
          }

          .gb-empty {
            padding: 55px 20px;
            border: 1px dashed var(--gb-border);
            border-radius: 16px;
            background: var(--gb-surface);
            color: var(--gb-muted);
            text-align: center;
          }

          .gb-overlay {
            position: fixed;
            inset: 0;
            z-index: 1600;
            padding: 14px;
            background: rgba(2, 8, 23, 0.74);
            backdrop-filter: blur(7px);
            display: flex;
            align-items: center;
            justify-content: center;
          }

          .gb-modal {
            width: 100%;
            max-width: 1050px;
            max-height: 93vh;
            overflow: auto;
            border: 1px solid var(--gb-border);
            border-radius: 19px;
            background: var(--gb-surface);
            color: var(--gb-text);
            box-shadow: 0 30px 90px rgba(0, 0, 0, 0.4);
          }

          .gb-modal.recording {
            max-width: 900px;
          }

          .gb-modal-header {
            position: sticky;
            top: 0;
            z-index: 3;
            padding: 17px 19px;
            border-bottom: 1px solid var(--gb-border);
            background: var(--gb-surface);
            display: flex;
            justify-content: space-between;
            gap: 15px;
          }

          .gb-modal-title {
            margin: 0 0 3px;
            color: var(--gb-text);
            font-weight: 800;
          }

          .gb-close {
            width: 37px;
            height: 37px;
            flex: none;
            border: 0;
            border-radius: 50%;
            background: rgba(239, 68, 68, 0.11);
            color: #ef4444;
            display: flex;
            align-items: center;
            justify-content: center;
          }

          .gb-modal-body {
            padding: 19px;
          }

          .gb-info-grid {
            display: grid;
            grid-template-columns: repeat(5, 1fr);
            gap: 10px;
            margin-bottom: 15px;
          }

          .gb-info,
          .gb-teacher-card {
            padding: 12px;
            border: 1px solid var(--gb-border);
            border-radius: 12px;
            background: var(--gb-surface-soft);
          }

          .gb-info label,
          .gb-teacher-card label {
            display: block;
            color: var(--gb-muted);
            font-size: 9px;
            font-weight: 800;
            text-transform: uppercase;
          }

          .gb-info div {
            margin-top: 4px;
            color: var(--gb-text);
            font-weight: 800;
          }

          .gb-teachers {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
            margin-bottom: 15px;
          }

          .gb-chip {
            display: inline-flex;
            align-items: center;
            gap: 5px;
            margin: 7px 4px 0 0;
            padding: 7px 9px;
            border-radius: 999px;
            font-size: 11px;
            font-weight: 800;
          }

          .gb-chip.main {
            background: rgba(34, 197, 94, 0.14);
            color: #16a34a;
          }

          .gb-chip.assistant {
            background: rgba(245, 158, 11, 0.14);
            color: #d97706;
          }

          .gb-student-info {
            display: flex;
            align-items: center;
            gap: 8px;
          }

          .gb-student-image {
            width: 35px;
            height: 35px;
            border-radius: 50%;
            object-fit: cover;
          }

          .gb-video-wrap {
            padding: 13px;
            background: #000000;
          }

          .gb-video {
            display: block;
            width: 100%;
            max-height: 70vh;
            border-radius: 10px;
            background: #000000;
          }

          .gb-video-footer {
            padding: 12px 16px;
            border-top: 1px solid var(--gb-border);
            display: flex;
            justify-content: flex-end;
          }

          .gb-external-link {
            display: inline-flex;
            align-items: center;
            gap: 5px;
            padding: 8px 11px;
            border-radius: 9px;
            background: var(--gb-primary-soft);
            color: var(--gb-primary);
            font-size: 11px;
            font-weight: 800;
            text-decoration: none;
          }

          @media (max-width: 1150px) {
            .gb-metrics {
              grid-template-columns: repeat(3, 1fr);
            }

            .gb-filter-grid {
              grid-template-columns: repeat(2, 1fr);
            }

            .gb-info-grid {
              grid-template-columns: repeat(2, 1fr);
            }
          }

          @media (max-width: 767px) {
            .gb-metrics,
            .gb-filter-grid,
            .gb-info-grid,
            .gb-teachers {
              grid-template-columns: 1fr;
            }

            .gb-counts {
              display: none;
            }

            .gb-programme-button {
              align-items: flex-start;
            }

            .gb-programme-icon {
              width: 40px;
              height: 40px;
            }

            .gb-overlay {
              padding: 6px;
            }

            .gb-modal {
              max-height: 97vh;
              border-radius: 13px;
            }

            .gb-modal-header,
            .gb-modal-body {
              padding: 14px;
            }
          }
        `}
      </style>

      <div className="gb-header">
        <div>
          <h4 className="gb-title">
            Group Bookings
          </h4>

          <p className="gb-muted mb-0">
            Programme-wise batches,
            sessions, students,
            teachers, payments and
            recordings.
          </p>
        </div>

        <button
          type="button"
          className="gb-button"
          onClick={
            fetchGroupBookings
          }
        >
          <Icon icon="solar:refresh-linear" />
          Refresh
        </button>
      </div>

      <div className="gb-metrics">
        {[
          [
            totals.programmes,
            "Programmes",
          ],
          [
            totals.batches,
            "Batches",
          ],
          [
            totals.sessions,
            "Sessions",
          ],
          [
            totals.students,
            "Students",
          ],
          [
            totals.completed,
            "Completed",
          ],
          [
            totals.missed,
            "Missed",
          ],
        ].map(
          ([
            value,
            label,
          ]) => (
            <div
              className="gb-metric"
              key={label}
            >
              <strong>
                {value}
              </strong>

              <span>
                {label}
              </span>
            </div>
          )
        )}
      </div>

      <div className="gb-filter-card">
        <div className="gb-filter-grid">
          <div className="gb-search">
            <Icon
              icon="ion:search-outline"
              className="gb-search-icon"
            />

            <input
              type="text"
              className="gb-control"
              value={searchTerm}
              onChange={(
                event
              ) =>
                setSearchTerm(
                  event.target
                    .value
                )
              }
              placeholder="Search programme, teacher or student"
            />
          </div>

          <select
            className="gb-control"
            value={
              programmeFilter
            }
            onChange={(
              event
            ) => {
              setProgrammeFilter(
                event.target
                  .value
              );

              setBatchFilter(
                ""
              );
            }}
          >
            <option value="">
              All Programmes
            </option>

            {programmeOptions.map(
              (
                option
              ) => (
                <option
                  key={
                    option.value
                  }
                  value={
                    option.value
                  }
                >
                  {
                    option.label
                  }
                </option>
              )
            )}
          </select>

          <select
            className="gb-control"
            value={
              batchFilter
            }
            onChange={(
              event
            ) =>
              setBatchFilter(
                event.target
                  .value
              )
            }
          >
            <option value="">
              All Batches
            </option>

            {batchOptions
              .filter(
                (
                  option
                ) =>
                  !programmeFilter ||
                  String(
                    option.programmeId
                  ) ===
                  String(
                    programmeFilter
                  )
              )
              .map(
                (
                  option
                ) => (
                  <option
                    key={
                      option.value
                    }
                    value={
                      option.value
                    }
                  >
                    {
                      option.label
                    }
                  </option>
                )
              )}
          </select>

          <select
            className="gb-control"
            value={
              statusFilter
            }
            onChange={(
              event
            ) =>
              setStatusFilter(
                event.target
                  .value
              )
            }
          >
            <option value="">
              All Statuses
            </option>

            <option value="ongoing">
              Ongoing
            </option>

            <option value="upcoming">
              Upcoming
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
            className="gb-reset"
            onClick={
              resetFilters
            }
          >
            Reset
          </button>
        </div>
      </div>

      {loadError ? (
        <div className="alert alert-danger d-flex align-items-center justify-content-between gap-3">
          <span>
            {loadError}
          </span>

          <button
            type="button"
            className="btn btn-sm btn-danger"
            onClick={
              fetchGroupBookings
            }
          >
            Reload
          </button>
        </div>
      ) : null}

      {!filteredProgrammes
        .length ? (
        <div className="gb-empty">
          <Icon
            icon="solar:calendar-search-linear"
            width="46"
          />

          <h6 className="mt-3 mb-1">
            No group bookings
            found
          </h6>

          <p className="mb-0">
            No programme matches
            the selected filters.
          </p>
        </div>
      ) : (
        filteredProgrammes.map(
          (
            programme
          ) => {
            const programmeOpen =
              openProgrammeId ===
              String(
                programme.id
              );

            return (
              <div
                key={
                  programme.id
                }
                className="gb-programme"
              >
                <button
                  type="button"
                  className="gb-programme-button"
                  onClick={() => {
                    setOpenProgrammeId(
                      programmeOpen
                        ? ""
                        : String(
                          programme.id
                        )
                    );

                    setOpenBatchKey(
                      ""
                    );
                  }}
                >
                  <div className="gb-programme-main">
                    <div className="gb-programme-icon">
                      <Icon
                        icon="solar:notebook-bookmark-linear"
                        width="24"
                      />
                    </div>

                    <div>
                      <h5 className="gb-programme-name">
                        {
                          programme.name
                        }
                      </h5>

                      <div className="gb-programme-meta">
                        <span>
                          {
                            programme.stage
                          }
                        </span>

                        <span>
                          {formatMoney(
                            programme.price
                          )}
                        </span>

                        <span>
                          Programme ID:{" "}
                          {
                            programme.id
                          }
                        </span>
                      </div>

                      {programme.description ? (
                        <p className="gb-description">
                          {
                            programme.description
                          }
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="d-flex align-items-center gap-3">
                    <div className="gb-counts">
                      <div className="gb-count">
                        <strong>
                          {
                            programme.totalBatches
                          }
                        </strong>

                        <span>
                          Batches
                        </span>
                      </div>

                      <div className="gb-count">
                        <strong>
                          {
                            programme.totalSessions
                          }
                        </strong>

                        <span>
                          Sessions
                        </span>
                      </div>

                      <div className="gb-count">
                        <strong>
                          {
                            programme.studentCount
                          }
                        </strong>

                        <span>
                          Students
                        </span>
                      </div>

                      <div className="gb-count">
                        <strong>
                          {
                            programme.missed
                          }
                        </strong>

                        <span>
                          Missed
                        </span>
                      </div>
                    </div>

                    <Icon
                      icon="iconamoon:arrow-down-2"
                      className={`gb-chevron ${programmeOpen
                        ? "open"
                        : ""
                        }`}
                    />
                  </div>
                </button>

                {programmeOpen ? (
                  <div className="gb-programme-body">
                    {programme.batches.map(
                      (
                        batch
                      ) => {
                        const currentBatchKey =
                          `${programme.id}|${batch.id}`;

                        const batchOpen =
                          openBatchKey ===
                          currentBatchKey;

                        return (
                          <div
                            key={
                              batch.id
                            }
                            className="gb-batch"
                          >
                            <button
                              type="button"
                              className="gb-batch-button"
                              onClick={() =>
                                setOpenBatchKey(
                                  batchOpen
                                    ? ""
                                    : currentBatchKey
                                )
                              }
                            >
                              <div>
                                <h6 className="gb-batch-name">
                                  {
                                    batch.label
                                  }
                                </h6>

                                <div className="gb-small">
                                  {
                                    batch.sessions
                                      .length
                                  }{" "}
                                  sessions ·{" "}
                                  {
                                    batch.studentCount
                                  }{" "}
                                  students
                                </div>
                              </div>

                              <Icon
                                icon="iconamoon:arrow-down-2"
                                className={`gb-chevron ${batchOpen
                                  ? "open"
                                  : ""
                                  }`}
                              />
                            </button>

                            {batchOpen ? (
                              <div className="gb-batch-body">
                                <div className="gb-table-wrap">
                                  <table className="gb-table">
                                    <thead>
                                      <tr>
                                        <th>
                                          Session
                                        </th>

                                        <th>
                                          Date &
                                          Time
                                        </th>

                                        <th>
                                          Main
                                          Teacher
                                        </th>

                                        <th>
                                          Assistants
                                        </th>

                                        <th>
                                          Students
                                        </th>

                                        <th>
                                          Capacity
                                        </th>

                                        <th>
                                          Payments
                                        </th>

                                        <th>
                                          Status
                                        </th>

                                        <th>
                                          Recording
                                        </th>

                                        <th>
                                          Action
                                        </th>
                                      </tr>
                                    </thead>

                                    <tbody>
                                      {batch.sessions.map(
                                        (
                                          session
                                        ) => (
                                          <tr
                                            key={
                                              session.id
                                            }
                                          >
                                            <td>
                                              <div className="gb-strong">
                                                {
                                                  session.title
                                                }
                                              </div>

                                              <div className="gb-small">
                                                {
                                                  session.subject
                                                }
                                              </div>
                                            </td>

                                            <td>
                                              <div className="gb-strong">
                                                {
                                                  session.date
                                                }
                                              </div>

                                              <div className="gb-small">
                                                {
                                                  session.startTime
                                                }{" "}
                                                -{" "}
                                                {
                                                  session.endTime
                                                }
                                              </div>
                                            </td>

                                            <td>
                                              <div className="gb-strong">
                                                {session.mainTeachers
                                                  .map(
                                                    (
                                                      teacher
                                                    ) =>
                                                      teacher.name
                                                  )
                                                  .join(
                                                    ", "
                                                  ) ||
                                                  "-"}
                                              </div>
                                            </td>

                                            <td>
                                              <div className="gb-small">
                                                {session.assistants
                                                  .map(
                                                    (
                                                      teacher
                                                    ) =>
                                                      teacher.name
                                                  )
                                                  .join(
                                                    ", "
                                                  ) ||
                                                  "No Assistant"}
                                              </div>
                                            </td>

                                            <td>
                                              <div className="gb-avatars">
                                                {session.students
                                                  .slice(
                                                    0,
                                                    4
                                                  )
                                                  .map(
                                                    (
                                                      student
                                                    ) => (
                                                      <img
                                                        key={
                                                          student.id ||
                                                          student.name
                                                        }
                                                        src={
                                                          student.image
                                                        }
                                                        alt={
                                                          student.name
                                                        }
                                                        className="gb-avatar"
                                                        onError={(
                                                          event
                                                        ) => {
                                                          event.currentTarget.src =
                                                            "assets/images/user.png";
                                                        }}
                                                      />
                                                    )
                                                  )}

                                                <span className="gb-student-count">
                                                  {
                                                    session
                                                      .students
                                                      .length
                                                  }{" "}
                                                  booked
                                                </span>
                                              </div>
                                            </td>

                                            <td>
                                              {
                                                session
                                                  .students
                                                  .length
                                              }{" "}
                                              /{" "}
                                              {session.capacity ||
                                                "-"}
                                            </td>

                                            <td>
                                              <div className="gb-payment-summary">
                                                {[
                                                  "paid",
                                                  "free",
                                                  "unpaid",
                                                  "pending",
                                                  "failed",
                                                  "refunded",
                                                ]
                                                  .filter(
                                                    (
                                                      key
                                                    ) =>
                                                      Number(
                                                        session
                                                          .paymentSummary?.[
                                                        key
                                                        ] ||
                                                        0
                                                      ) >
                                                      0
                                                  )
                                                  .map(
                                                    (
                                                      key
                                                    ) => (
                                                      <span
                                                        key={
                                                          key
                                                        }
                                                        className={`gb-payment-count ${key}`}
                                                      >
                                                        {
                                                          session
                                                            .paymentSummary[
                                                          key
                                                          ]
                                                        }{" "}
                                                        {key
                                                          .charAt(
                                                            0
                                                          )
                                                          .toUpperCase() +
                                                          key.slice(
                                                            1
                                                          )}
                                                      </span>
                                                    )
                                                  )}
                                              </div>
                                            </td>

                                            <td>
                                              <span
                                                className={statusClass(
                                                  session.status
                                                )}
                                              >
                                                {
                                                  session.status
                                                }
                                              </span>
                                            </td>

                                            <td>
                                              {/*
                                               * Show recording whenever
                                               * URL exists, regardless of
                                               * stale cancelled flag.
                                               */}
                                              {session.hasRecording ? (
                                                <button
                                                  type="button"
                                                  className="gb-recording-button"
                                                  onClick={() =>
                                                    openRecording(
                                                      session
                                                    )
                                                  }
                                                >
                                                  <Icon icon="solar:videocamera-record-linear" />

                                                  View
                                                  Recording
                                                </button>
                                              ) : session.status ===
                                                "Missed" ? (
                                                <span className="gb-no-recording">
                                                  <Icon icon="solar:videocamera-slash-linear" />

                                                  No
                                                  Recording
                                                </span>
                                              ) : (
                                                "-"
                                              )}
                                            </td>

                                            <td>
                                              <div className="gb-action-buttons">
                                                <button
                                                  type="button"
                                                  className="gb-button"
                                                  onClick={() =>
                                                    setSelectedSession(
                                                      {
                                                        ...session,
                                                        programme,
                                                        batch,
                                                      }
                                                    )
                                                  }
                                                  disabled={
                                                    String(
                                                      deletingSessionId
                                                    ) ===
                                                    String(
                                                      session.id
                                                    )
                                                  }
                                                >
                                                  <Icon icon="solar:eye-linear" />

                                                  Details
                                                </button>

                                                {canDeleteSession(
                                                  session
                                                ) ? (
                                                  <button
                                                    type="button"
                                                    className="gb-delete-button"
                                                    onClick={() =>
                                                      handleDeleteSession(
                                                        session,
                                                        programme,
                                                        batch
                                                      )
                                                    }
                                                    disabled={
                                                      String(
                                                        deletingSessionId
                                                      ) ===
                                                      String(
                                                        session.id
                                                      )
                                                    }
                                                  >
                                                    {String(
                                                      deletingSessionId
                                                    ) ===
                                                      String(
                                                        session.id
                                                      ) ? (
                                                      <>
                                                        <span
                                                          className="spinner-border spinner-border-sm"
                                                          role="status"
                                                          aria-hidden="true"
                                                        />

                                                        Deleting...
                                                      </>
                                                    ) : (
                                                      <>
                                                        <Icon icon="solar:trash-bin-trash-linear" />

                                                        Delete
                                                      </>
                                                    )}
                                                  </button>
                                                ) : null}
                                              </div>
                                            </td>
                                          </tr>
                                        )
                                      )}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        );
                      }
                    )}
                  </div>
                ) : null}
              </div>
            );
          }
        )
      )}

      {selectedSession ? (
        <div
          className="gb-overlay"
          onClick={() =>
            setSelectedSession(
              null
            )
          }
        >
          <div
            className="gb-modal"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <div className="gb-modal-header">
              <div>
                <h5 className="gb-modal-title">
                  {
                    selectedSession.title
                  }
                </h5>

                <p className="gb-muted mb-0">
                  {
                    selectedSession
                      .programme.name
                  }{" "}
                  ·{" "}
                  {
                    selectedSession
                      .batch.label
                  }
                </p>
              </div>

              <button
                type="button"
                className="gb-close"
                onClick={() =>
                  setSelectedSession(
                    null
                  )
                }
              >
                <Icon
                  icon="radix-icons:cross-2"
                  width="21"
                />
              </button>
            </div>

            <div className="gb-modal-body">
              <div className="gb-info-grid">
                <div className="gb-info">
                  <label>
                    Date
                  </label>

                  <div>
                    {
                      selectedSession.date
                    }
                  </div>
                </div>

                <div className="gb-info">
                  <label>
                    Time
                  </label>

                  <div>
                    {
                      selectedSession.startTime
                    }{" "}
                    -{" "}
                    {
                      selectedSession.endTime
                    }
                  </div>
                </div>

                <div className="gb-info">
                  <label>
                    Subject
                  </label>

                  <div>
                    {
                      selectedSession.subject
                    }
                  </div>
                </div>

                <div className="gb-info">
                  <label>
                    Capacity
                  </label>

                  <div>
                    {
                      selectedSession
                        .students.length
                    }{" "}
                    /{" "}
                    {selectedSession.capacity ||
                      "-"}
                  </div>
                </div>

                <div className="gb-info">
                  <label>
                    Status
                  </label>

                  <div>
                    <span
                      className={statusClass(
                        selectedSession.status
                      )}
                    >
                      {
                        selectedSession.status
                      }
                    </span>
                  </div>
                </div>
              </div>

              <div className="gb-teachers">
                <div className="gb-teacher-card">
                  <label>
                    Main Teacher
                  </label>

                  {selectedSession
                    .mainTeachers
                    .length ? (
                    selectedSession.mainTeachers.map(
                      (
                        teacher
                      ) => (
                        <span
                          key={
                            teacher.id ||
                            teacher.name
                          }
                          className="gb-chip main"
                        >
                          <Icon icon="solar:user-check-rounded-linear" />

                          {
                            teacher.name
                          }
                        </span>
                      )
                    )
                  ) : (
                    <div className="gb-small mt-2">
                      Main teacher
                      not available
                    </div>
                  )}
                </div>

                <div className="gb-teacher-card">
                  <label>
                    Assistant Teachers
                  </label>

                  {selectedSession
                    .assistants
                    .length ? (
                    selectedSession.assistants.map(
                      (
                        teacher
                      ) => (
                        <span
                          key={
                            teacher.id ||
                            teacher.name
                          }
                          className="gb-chip assistant"
                        >
                          <Icon icon="solar:users-group-rounded-linear" />

                          {
                            teacher.name
                          }
                        </span>
                      )
                    )
                  ) : (
                    <div className="gb-small mt-2">
                      No assistant
                      teacher assigned
                    </div>
                  )}
                </div>
              </div>

              <div className="d-flex align-items-center justify-content-between flex-wrap gap-3 mb-3">
                <h6 className="mb-0">
                  Booked Students (
                  {
                    selectedSession
                      .students.length
                  }
                  )
                </h6>

                {selectedSession.hasRecording ? (
                  <button
                    type="button"
                    className="gb-recording-button"
                    onClick={() =>
                      openRecording(
                        selectedSession
                      )
                    }
                  >
                    <Icon icon="solar:videocamera-record-linear" />

                    View Recording
                  </button>
                ) : selectedSession.status ===
                  "Missed" ? (
                  <span className="gb-no-recording">
                    <Icon icon="solar:videocamera-slash-linear" />

                    Recording Not
                    Available
                  </span>
                ) : null}
              </div>

              <div className="gb-table-wrap">
                <table
                  className="gb-table"
                  style={{
                    minWidth: 980,
                  }}
                >
                  <thead>
                    <tr>
                      <th>
                        Student
                      </th>

                      <th>
                        Booking ID
                      </th>


                      <th>
                        Payment Status
                      </th>

                      <th>
                        Payment Type
                      </th>

                      <th>
                        Booking Type
                      </th>

                      <th>
                        Group Amount
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {selectedSession.students.map(
                      (
                        student
                      ) => (
                        <tr
                          key={
                            student.id ||
                            student.bookingId ||
                            student.name
                          }
                        >
                          <td>
                            <div className="gb-student-info">
                              <img
                                src={
                                  student.image
                                }
                                alt={
                                  student.name
                                }
                                className="gb-student-image"
                                onError={(
                                  event
                                ) => {
                                  event.currentTarget.src =
                                    "assets/images/user.png";
                                }}
                              />

                              <div>
                                <div className="gb-strong">
                                  {
                                    student.name
                                  }
                                </div>

                                <div className="gb-small">
                                  Student ID:{" "}
                                  {student.id ||
                                    "-"}
                                </div>
                              </div>
                            </div>
                          </td>

                          <td>
                            {student.bookingId
                              ? `#${student.bookingId}`
                              : "-"}
                          </td>

                          <td>
                            <span
                              className={paymentClass(
                                student.paymentStatus
                              )}
                            >
                              {
                                student.paymentStatus
                              }
                            </span>
                          </td>

                          <td>
                            {
                              student.paymentType
                            }
                          </td>

                          <td>
                            {
                              student.bookingType
                            }
                          </td>

                          <td>
                            {formatMoney(
                              student.amount
                            )}
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {recordingModal ? (
        <div
          className="gb-overlay"
          onClick={() =>
            setRecordingModal(
              null
            )
          }
        >
          <div
            className="gb-modal recording"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <div className="gb-modal-header">
              <div>
                <h5 className="gb-modal-title">
                  Session Recording
                </h5>

                <p className="gb-muted mb-0">
                  {
                    recordingModal.title
                  }{" "}
                  ·{" "}
                  {
                    recordingModal.date
                  }
                </p>
              </div>

              <button
                type="button"
                className="gb-close"
                onClick={() =>
                  setRecordingModal(
                    null
                  )
                }
              >
                <Icon
                  icon="radix-icons:cross-2"
                  width="21"
                />
              </button>
            </div>

            <div className="gb-video-wrap">
              <video
                className="gb-video"
                controls
                controlsList="nodownload"
                preload="metadata"
                src={
                  recordingModal.url
                }
              >
                Your browser does not
                support video playback.
              </video>
            </div>

            <div className="gb-video-footer">
              <a
                href={
                  recordingModal.url
                }
                target="_blank"
                rel="noreferrer"
                className="gb-external-link"
              >
                <Icon icon="solar:external-link-linear" />

                Open Recording in
                New Tab
              </a>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default GroupBookingListLayer;