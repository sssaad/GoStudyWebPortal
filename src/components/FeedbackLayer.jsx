import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import moment from "moment";
import { Icon } from "@iconify/react";
import Swal from "sweetalert2";
import { getToken } from "../api/getToken";

const BASE_HEADERS = {
  projectid: "1",
  userid: "test",
  password: "test",
  "x-api-key": "abc123456789",
};

const API_BASE =
  "https://api.learnyourlanguage.org/RestController_Thirdparty.php?view=";

const RUN_SP_URL = `${API_BASE}runStoredProcedure`;
const UPDATE_DYNAMIC_URL = `${API_BASE}update_dynamic_data`;

const SEND_ONE_TO_ONE_EMAIL_URL = `${API_BASE}send_progress_report_email`;
const SEND_GROUP_EMAIL_URL = `${API_BASE}send_group_progress_report_email`;
const REVIEW_FEEDBACK_URL = `${API_BASE}review_progress_feedback`;

const REPORT_TYPES = {
  ONE_TO_ONE: "one_to_one",
  GROUP: "group",
};

const ENUM_OPTIONS = [
  "Excellent",
  "Good",
  "Satisfactory",
  "Poor",
  "Very Poor",
];

const ONE_TO_ONE_SELECT_FIELDS = [
  {
    field: "punctuality",
    label: "Punctuality",
    className: "col-md-4",
  },
  {
    field: "engagement",
    label: "Engagement",
    className: "col-md-4",
  },
  {
    field: "behaviour",
    label: "Behaviour",
    className: "col-md-4",
  },
  {
    field: "understanding",
    label: "Understanding",
    className: "col-md-6",
  },
  {
    field: "final_class_grade",
    label: "Final Class Grade",
    className: "col-md-6",
  },
];

const ONE_TO_ONE_TEXT_FIELDS = [
  {
    field: "topics_covered_today",
    label: "Topics Covered Today",
    placeholder: "Write topics covered today...",
  },
  {
    field: "what_went_well_today",
    label: "What Went Well Today",
    placeholder: "Write what went well today...",
  },
  {
    field: "areas_for_development",
    label: "Areas for Further Development",
    placeholder: "Write areas for further development...",
  },
  {
    field: "recommended_next_steps",
    label: "Recommended Next Steps",
    placeholder: "Write recommended next steps...",
  },
  {
    field: "next_lesson_plan",
    label: "What We Will Work On Next Lesson",
    placeholder: "Write the next lesson plan...",
  },
];

const GROUP_REQUIRED_FIELDS = [
  ["group_rating", "Group Rating"],
  ["topic_covered", "Topic Covered"],
  ["performance_comment", "Performance Comment"],
  ["highlights", "Highlights"],
  ["development_areas", "Development Areas"],
  ["suggested_practice", "Suggested Practice"],
  ["looking_ahead", "Looking Ahead"],
];

const formatDate = (value) => {
  if (!value) return "";

  const parsed = moment(
    value,
    [
      "YYYY-MM-DD",
      "YYYY/MM/DD",
      "YYYY-MM-DD HH:mm:ss",
      "YYYY-MM-DDTHH:mm:ss",
      moment.ISO_8601,
    ],
    true
  );

  if (parsed.isValid()) {
    return parsed.format("DD MMM YYYY");
  }

  const loose = moment(value);

  return loose.isValid()
    ? loose.format("DD MMM YYYY")
    : String(value);
};

const formatTime = (value) => {
  if (!value) return "";

  const parsed = moment(
    value,
    ["HH:mm:ss", "HH:mm", "hh:mm A", "h:mm A"],
    true
  );

  if (parsed.isValid()) {
    return parsed.format("hh:mm A");
  }

  const loose = moment(value);

  return loose.isValid()
    ? loose.format("hh:mm A")
    : String(value);
};

const normalizeUrl = (value) =>
  String(value || "")
    .replace(/\\\//g, "/")
    .trim();

const parseBookDateTs = (value) => {
  const raw = String(value || "").trim();

  if (!raw) return 0;

  let parsed = moment(
    raw,
    [
      "YYYY-MM-DD",
      "YYYY/MM/DD",
      "YYYY-MM-DD HH:mm:ss",
      "YYYY-MM-DDTHH:mm:ss",
      "DD MMM YYYY",
      moment.ISO_8601,
    ],
    true
  );

  if (!parsed.isValid()) {
    parsed = moment(raw);
  }

  return parsed.isValid()
    ? parsed.valueOf()
    : 0;
};

const parseTimeMinutes = (value) => {
  const raw = String(value || "").trim();

  if (!raw) return -1;

  let parsed = moment(
    raw,
    ["HH:mm:ss", "HH:mm", "hh:mm A", "h:mm A"],
    true
  );

  if (!parsed.isValid()) {
    parsed = moment(raw);
  }

  return parsed.isValid()
    ? parsed.hours() * 60 + parsed.minutes()
    : -1;
};

const buildFullName = (
  firstName,
  lastName,
  fallback = ""
) => {
  const fullName = [firstName, lastName]
    .filter(Boolean)
    .join(" ")
    .trim();

  return fullName || fallback || "";
};

const mapReportRow = (item, reportType) => {
  const isGroup =
    reportType === REPORT_TYPES.GROUP;

  const rawBookDate =
    item.booking_date ??
    item.session_date ??
    item.book_date ??
    item.bookDate ??
    "";

  const rawStart =
    item.booking_start_time ??
    item.session_start_time ??
    item.slot_start ??
    item.slot1_time ??
    item.slotStart ??
    "";

  const rawEnd =
    item.booking_end_time ??
    item.session_end_time ??
    item.slot_end ??
    item.slot2_time ??
    item.slotEnd ??
    "";

  const emailStatus = String(
    item.email_status ??
      item.emailStatus ??
      "pending"
  ).toLowerCase();

  /*
   * review_status is returned by both
   * get_performance and get_group_performance_reports.
   *
   * Legacy reports that were already emailed before the
   * approval workflow existed are treated as approved in
   * the UI so existing sent reports remain locked/consistent.
   */
  const reviewStatus =
    emailStatus === "sent"
      ? "approved"
      : String(
          item.review_status ??
            item.reviewStatus ??
            "pending"
        ).toLowerCase();

  const studentName = buildFullName(
    item.student_firstname,
    item.student_lastname,
    item.student_fullname ??
      item.student_name ??
      item.student?.name ??
      item.studentName ??
      item.username ??
      ""
  );

  const teacherName = buildFullName(
    item.teacher_firstname,
    item.teacher_lastname,
    item.teacher_fullname ??
      item.teacher_name ??
      item.teacher?.name ??
      item.teacherName ??
      ""
  );

  const feedbackId = Number(
    item.feedback_id ??
      (isGroup ? item.id : 0)
  );

  const sessionId = Number(
    item.sessionid ??
      item.booking_id ??
      item.bookingid ??
      0
  );

  return {
    id: item.id,

    reportType,

    feedbackId,

    sessionid: sessionId,

    bookingId: Number(
      item.booking_id ??
        item.bookingid ??
        sessionId ??
        0
    ),

    groupLiveSessionId: Number(
      item.group_live_session_id ?? 0
    ),

    recordingUrl: normalizeUrl(
      item.s3Url ??
        item.s3_url ??
        item.recording_s3_url ??
        item.recordingUrl ??
        ""
    ),

    bookDate: formatDate(rawBookDate),

    slotStart: formatTime(rawStart),

    slotEnd: formatTime(rawEnd),

    bookDateRaw: rawBookDate,

    bookDateTs:
      parseBookDateTs(rawBookDate),

    slotStartMin:
      parseTimeMinutes(rawStart),

    email_status:
      emailStatus || "pending",

    review_status:
      reviewStatus || "pending",

    student_email_status: String(
      item.student_email_status ?? "pending"
    ).toLowerCase(),

    parent_email_status: String(
      item.parent_email_status ?? "pending"
    ).toLowerCase(),

    isEmailSent:
      emailStatus === "sent",

    studentName,

    teacherName,

    programmeName:
      item.programme_name ??
      item.group_programme_name ??
      "",

    sessionTitle:
      item.session_title ??
      item.group_session_title ??
      "",

    subjectName:
      item.subject_name ??
      item.subjectname ??
      "",

    groupBatchId:
      item.group_batch_id ?? "",

    punctuality:
      item.punctuality ?? "",

    engagement:
      item.engagement ?? "",

    behaviour:
      item.behaviour ?? "",

    understanding:
      item.understanding ?? "",

    final_class_grade:
      item.final_class_grade ?? "",

    topics_covered_today:
      item.topics_covered_today ?? "",

    what_went_well_today:
      item.what_went_well_today ?? "",

    areas_for_development:
      item.areas_for_development ?? "",

    recommended_next_steps:
      item.recommended_next_steps ?? "",

    next_lesson_plan:
      item.next_lesson_plan ?? "",

    topic_covered:
      item.topic_covered ?? "",

    group_rating:
      item.group_rating === null ||
      item.group_rating === undefined
        ? ""
        : String(item.group_rating),

    performance_comment:
      item.performance_comment ?? "",

    highlights:
      item.highlights ?? "",

    development_areas:
      item.development_areas ?? "",

    suggested_practice:
      item.suggested_practice ?? "",

    looking_ahead:
      item.looking_ahead ?? "",
  };
};

const isRowSent = (row) =>
  String(
    row?.email_status || ""
  ).toLowerCase() === "sent" ||
  Boolean(row?.isEmailSent);

const getReviewStatus = (row) =>
  String(
    row?.review_status ||
      "pending"
  ).toLowerCase();

const getReviewStatusMeta = (row) => {
  const status =
    getReviewStatus(row);

  if (status === "approved") {
    return {
      status,
      label: "Approved",
      badgeClass: "bg-success",
    };
  }

  if (status === "not_approved") {
    return {
      status,
      label: "Not Approved",
      badgeClass: "bg-danger",
    };
  }

  return {
    status: "pending",
    label: "Pending Review",
    badgeClass:
      "bg-warning text-dark",
  };
};

const isApiSuccess = (response) =>
  response?.data?.statusCode === 200 ||
  response?.data?.status === true ||
  response?.data?.success === true;

const buildGroupSessionRows = (rows) => {
  const sessionMap = new Map();

  rows.forEach((row) => {
    const key = row.groupLiveSessionId
      ? `group-session-${row.groupLiveSessionId}`
      : `group-feedback-${row.feedbackId}`;

    if (!sessionMap.has(key)) {
      sessionMap.set(key, []);
    }

    sessionMap.get(key).push(row);
  });

  return Array.from(
    sessionMap.entries()
  ).map(([groupKey, members]) => {
    const sortedMembers = [...members].sort(
      (first, second) =>
        Number(second.feedbackId || 0) -
        Number(first.feedbackId || 0)
    );

    const primary = sortedMembers[0];

    const allSent =
      sortedMembers.every(isRowSent);

    const anySent =
      sortedMembers.some(isRowSent);

    /*
     * A group session contains one feedback row per student.
     * Admin review applies to the whole group session, so the
     * merged row must expose one consistent review status.
     */
    const anyNotApproved =
      sortedMembers.some(
        (member) =>
          String(
            member.review_status ||
              "pending"
          ).toLowerCase() ===
          "not_approved"
      );

    const allApproved =
      sortedMembers.every(
        (member) =>
          String(
            member.review_status ||
              "pending"
          ).toLowerCase() ===
          "approved"
      );

    const groupReviewStatus =
      anySent
        ? "approved"
        : anyNotApproved
        ? "not_approved"
        : allApproved
        ? "approved"
        : "pending";

    const studentNames =
      sortedMembers
        .map(
          (member) =>
            member.studentName
        )
        .filter(Boolean);

    return {
      ...primary,

      groupKey,

      members: sortedMembers,

      studentNames,

      studentName:
        studentNames.join(", "),

      memberCount:
        sortedMembers.length,

      allEmailsSent:
        allSent,

      hasAnyEmailSent:
        anySent,

      hasPartialEmailSent:
        anySent && !allSent,

      email_status: allSent
        ? "sent"
        : anySent
        ? "partial"
        : "pending",

      review_status:
        groupReviewStatus,

      isEmailSent:
        allSent,
    };
  });
};

const getRowIdentity = (
  row,
  reportType
) => {
  if (
    reportType === REPORT_TYPES.GROUP
  ) {
    return (
      row.groupKey ||
      (row.groupLiveSessionId
        ? `group-session-${row.groupLiveSessionId}`
        : `group-feedback-${row.feedbackId}`)
    );
  }

  return `one-to-one-${row.sessionid}`;
};

const FeedbackLayer = () => {
  const [activeTab, setActiveTab] =
    useState(
      REPORT_TYPES.ONE_TO_ONE
    );

  const [rows, setRows] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const [reloadKey, setReloadKey] =
    useState(0);

  const [showModal, setShowModal] =
    useState(false);

  const [currentRow, setCurrentRow] =
    useState(null);

  const [
    isRecordingOpen,
    setIsRecordingOpen,
  ] = useState(false);

  const [
    activeRecordingUrl,
    setActiveRecordingUrl,
  ] = useState("");

  const [
    currentPage,
    setCurrentPage,
  ] = useState(1);

  const perPage = 15;

  const [
    savingFeedback,
    setSavingFeedback,
  ] = useState(false);

  const [
    sendingRowKey,
    setSendingRowKey,
  ] = useState("");

  const [
    reviewingRowKey,
    setReviewingRowKey,
  ] = useState("");

  const [search, setSearch] =
    useState("");

  const [
    statusFilter,
    setStatusFilter,
  ] = useState("all");

  const [dateFrom, setDateFrom] =
    useState("");

  const [dateTo, setDateTo] =
    useState("");

  const isGroupTab =
    activeTab === REPORT_TYPES.GROUP;

  const resetFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setDateFrom("");
    setDateTo("");
    setCurrentPage(1);
  };

  useEffect(() => {
    let mounted = true;

    const fetchRows = async () => {
      try {
        setLoading(true);

        const token =
          await getToken();

        if (!token) {
          throw new Error(
            "Token not found"
          );
        }

        const procedureName =
          isGroupTab
            ? "get_group_performance_reports"
            : "get_performance";

        const response =
          await axios.post(
            RUN_SP_URL,
            {
              procedureName,
              parameters: [],
            },
            {
              headers: {
                ...BASE_HEADERS,
                token,
              },
            }
          );

        const data =
          response?.data?.data ?? [];

        const mapped =
          Array.isArray(data)
            ? data.map((item) =>
                mapReportRow(
                  item,
                  activeTab
                )
              )
            : [];

        if (mounted) {
          setRows(mapped);
          setCurrentPage(1);
        }
      } catch (error) {
        console.error(error);

        if (mounted) {
          setRows([]);

          Swal.fire(
            "Error",
            error?.response?.data
              ?.message ||
              "Unable to load progress reports.",
            "error"
          );
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    fetchRows();

    return () => {
      mounted = false;
    };
  }, [
    activeTab,
    isGroupTab,
    reloadKey,
  ]);

  useEffect(() => {
    resetFilters();

    setCurrentRow(null);

    setShowModal(false);

    setSendingRowKey("");

    setReviewingRowKey("");
  }, [activeTab]);

  const filteredSortedRows =
    useMemo(() => {
      const rawSourceRows =
        Array.isArray(rows)
          ? [...rows]
          : [];

      const sourceRows =
        isGroupTab
          ? buildGroupSessionRows(
              rawSourceRows
            )
          : rawSourceRows;

      const fromTs = dateFrom
        ? moment(
            dateFrom,
            "YYYY-MM-DD"
          )
            .startOf("day")
            .valueOf()
        : null;

      const toTs = dateTo
        ? moment(
            dateTo,
            "YYYY-MM-DD"
          )
            .endOf("day")
            .valueOf()
        : null;

      const query = String(
        search || ""
      )
        .trim()
        .toLowerCase();

      const filtered =
        sourceRows.filter((row) => {
          const isSent =
            String(
              row.email_status || ""
            ).toLowerCase() ===
              "sent" ||
            row.isEmailSent;

          if (
            statusFilter === "sent" &&
            !isSent
          ) {
            return false;
          }

          if (
            statusFilter ===
              "pending" &&
            isSent
          ) {
            return false;
          }

          if (
            fromTs !== null ||
            toTs !== null
          ) {
            const rowTimestamp =
              Number(
                row.bookDateTs || 0
              );

            if (!rowTimestamp) {
              return false;
            }

            if (
              fromTs !== null &&
              rowTimestamp < fromTs
            ) {
              return false;
            }

            if (
              toTs !== null &&
              rowTimestamp > toTs
            ) {
              return false;
            }
          }

          if (query) {
            const searchableText = [
              row.sessionid,
              row.feedbackId,
              row.bookingId,
              row.bookDate,
              row.studentName,
              row.studentNames?.join(
                " "
              ),
              row.teacherName,
              row.slotStart,
              row.slotEnd,
              row.programmeName,
              row.sessionTitle,
              row.subjectName,
              row.groupBatchId,
            ]
              .filter(
                (value) =>
                  value !== null &&
                  value !== undefined
              )
              .join(" ")
              .toLowerCase();

            if (
              !searchableText.includes(
                query
              )
            ) {
              return false;
            }
          }

          return true;
        });

      filtered.sort(
        (first, second) => {
          const dateDifference =
            Number(
              second.bookDateTs || 0
            ) -
            Number(
              first.bookDateTs || 0
            );

          if (
            dateDifference !== 0
          ) {
            return dateDifference;
          }

          const timeDifference =
            Number(
              second.slotStartMin ??
                -1
            ) -
            Number(
              first.slotStartMin ??
                -1
            );

          if (
            timeDifference !== 0
          ) {
            return timeDifference;
          }

          const secondId =
            isGroupTab
              ? Number(
                  second.groupLiveSessionId ||
                    second.feedbackId ||
                    0
                )
              : Number(
                  second.sessionid || 0
                );

          const firstId =
            isGroupTab
              ? Number(
                  first.groupLiveSessionId ||
                    first.feedbackId ||
                    0
                )
              : Number(
                  first.sessionid || 0
                );

          return secondId - firstId;
        }
      );

      return filtered;
    }, [
      rows,
      search,
      statusFilter,
      dateFrom,
      dateTo,
      isGroupTab,
    ]);

  const indexOfLast =
    currentPage * perPage;

  const indexOfFirst =
    indexOfLast - perPage;

  const currentRows =
    filteredSortedRows.slice(
      indexOfFirst,
      indexOfLast
    );

  const totalPages =
    Math.ceil(
      filteredSortedRows.length /
        perPage
    ) || 1;

  useEffect(() => {
    if (
      filteredSortedRows.length === 0
    ) {
      setCurrentPage(1);
    } else if (
      currentPage > totalPages
    ) {
      setCurrentPage(totalPages);
    }
  }, [
    filteredSortedRows.length,
    totalPages,
    currentPage,
  ]);

  useEffect(() => {
    setCurrentPage(1);
  }, [
    search,
    statusFilter,
    dateFrom,
    dateTo,
  ]);

  const openRecording = (row) => {
    const url = normalizeUrl(
      row?.recordingUrl
    );

    if (!url) return;

    setActiveRecordingUrl(url);

    setIsRecordingOpen(true);
  };

  const closeRecording = () => {
    setIsRecordingOpen(false);

    setActiveRecordingUrl("");
  };

  const openFeedbackModal = (
    row
  ) => {
    setCurrentRow({
      ...row,
    });

    setShowModal(true);
  };

  const closeFeedbackModal = () => {
    if (
      savingFeedback ||
      Boolean(reviewingRowKey)
    ) {
      return;
    }

    setShowModal(false);

    setCurrentRow(null);
  };

  const handleFeedbackChange = (
    field,
    value
  ) => {
    setCurrentRow((previous) => ({
      ...previous,
      [field]: value,
    }));
  };

  const handleSaveFeedback =
    async () => {
      if (!currentRow) return;

      const isSent =
        isGroupTab
          ? Boolean(
              currentRow.hasAnyEmailSent
            )
          : isRowSent(currentRow);

      if (isSent) {
        return Swal.fire(
          "Locked",
          "The report has already been emailed and can no longer be edited.",
          "info"
        );
      }

      if (
        isGroupTab &&
        !currentRow.feedbackId
      ) {
        return Swal.fire(
          "Error",
          "Group feedback ID is missing.",
          "error"
        );
      }

      if (
        !isGroupTab &&
        !currentRow.sessionid
      ) {
        return Swal.fire(
          "Error",
          "Session ID is missing.",
          "error"
        );
      }

      const confirmation =
        await Swal.fire({
          title:
            "Save Progress Report?",

          text: isGroupTab
            ? `This report will be updated for all ${
                currentRow.memberCount ||
                1
              } students in this group session.`
            : "The report will remain editable until its email is sent.",

          icon: "question",

          showCancelButton: true,

          confirmButtonText:
            "Yes, Save",

          cancelButtonText:
            "Cancel",
        });

      if (
        !confirmation.isConfirmed
      ) {
        return;
      }

      try {
        setSavingFeedback(true);

        const token =
          await getToken();

        if (!token) {
          throw new Error(
            "Token not found"
          );
        }

        const updatedData =
          isGroupTab
            ? {
                topic_covered:
                  currentRow
                    .topic_covered ||
                  "",

                group_rating:
                  currentRow
                    .group_rating ||
                  "",

                performance_comment:
                  currentRow
                    .performance_comment ||
                  "",

                highlights:
                  currentRow
                    .highlights ||
                  "",

                development_areas:
                  currentRow
                    .development_areas ||
                  "",

                suggested_practice:
                  currentRow
                    .suggested_practice ||
                  "",

                looking_ahead:
                  currentRow
                    .looking_ahead ||
                  "",

                modifieddate:
                  moment().format(
                    "YYYY-MM-DD HH:mm:ss"
                  ),
              }
            : {
                punctuality:
                  currentRow
                    .punctuality ||
                  "",

                engagement:
                  currentRow
                    .engagement ||
                  "",

                behaviour:
                  currentRow
                    .behaviour ||
                  "",

                understanding:
                  currentRow
                    .understanding ||
                  "",

                final_class_grade:
                  currentRow
                    .final_class_grade ||
                  "",

                topics_covered_today:
                  currentRow
                    .topics_covered_today ||
                  "",

                what_went_well_today:
                  currentRow
                    .what_went_well_today ||
                  "",

                areas_for_development:
                  currentRow
                    .areas_for_development ||
                  "",

                recommended_next_steps:
                  currentRow
                    .recommended_next_steps ||
                  "",

                next_lesson_plan:
                  currentRow
                    .next_lesson_plan ||
                  "",
              };

        const targetRows =
          isGroupTab
            ? currentRow.members || [
                currentRow,
              ]
            : [currentRow];

        const saveResponses =
          await Promise.all(
            targetRows.map(
              (target) => {
                const conditions =
                  isGroupTab
                    ? {
                        id: Number(
                          target.feedbackId
                        ),

                        deleted: 0,
                      }
                    : {
                        sessionid:
                          Number(
                            target.sessionid
                          ),
                      };

                return axios.post(
                  UPDATE_DYNAMIC_URL,
                  {
                    token,

                    tablename:
                      isGroupTab
                        ? "group_session_feedback"
                        : "performance",

                    conditions: [
                      conditions,
                    ],

                    updatedata: [
                      updatedData,
                    ],
                  },
                  {
                    headers: {
                      ...BASE_HEADERS,
                      token,
                    },
                  }
                );
              }
            )
          );

        if (
          saveResponses.some(
            (response) =>
              response?.data
                ?.statusCode !== 200
          )
        ) {
          throw new Error(
            "Unable to save one or more group reports."
          );
        }

        const currentIdentity =
          getRowIdentity(
            currentRow,
            activeTab
          );

        setRows((previousRows) =>
          previousRows.map((row) =>
            getRowIdentity(
              row,
              activeTab
            ) === currentIdentity
              ? {
                  ...row,
                  ...updatedData,
                }
              : row
          )
        );

        await Swal.fire(
          "Saved",
          "Progress report updated successfully.",
          "success"
        );

        setShowModal(false);

        setCurrentRow(null);
      } catch (error) {
        console.error(error);

        Swal.fire(
          "Error",
          error?.response?.data
            ?.message ||
            error?.message ||
            "Something went wrong while saving the report.",
          "error"
        );
      } finally {
        setSavingFeedback(false);
      }
    };

  const handleReviewFeedback =
    async (row, nextStatus) => {
      if (!row) return;

      const reviewStatus =
        String(
          nextStatus || ""
        ).toLowerCase();

      if (
        ![
          "approved",
          "not_approved",
        ].includes(reviewStatus)
      ) {
        return Swal.fire(
          "Error",
          "Invalid review status.",
          "error"
        );
      }

      const isSent =
        isGroupTab
          ? Boolean(
              row.hasAnyEmailSent
            )
          : isRowSent(row);

      if (isSent) {
        return Swal.fire(
          "Locked",
          "This report has already been emailed and can no longer be reviewed.",
          "info"
        );
      }

      if (
        isGroupTab &&
        !Number(row.feedbackId)
      ) {
        return Swal.fire(
          "Error",
          "Group feedback ID is missing.",
          "error"
        );
      }

      if (
        !isGroupTab &&
        !Number(row.sessionid)
      ) {
        return Swal.fire(
          "Error",
          "Session ID is missing.",
          "error"
        );
      }

      const isApproving =
        reviewStatus ===
        "approved";

      const confirmation =
        await Swal.fire({
          title: isApproving
            ? "Approve Feedback?"
            : "Mark as Not Approved?",

          text: isApproving
            ? "This feedback will be approved and can then be sent to the student and parent."
            : "The teacher will be notified by email and asked to update this feedback.",

          icon: isApproving
            ? "question"
            : "warning",

          showCancelButton: true,

          confirmButtonText:
            isApproving
              ? "Yes, Approve"
              : "Yes, Not Approved",

          cancelButtonText:
            "Cancel",

          confirmButtonColor:
            isApproving
              ? "#0d6efd"
              : "#dc3545",
        });

      if (
        !confirmation.isConfirmed
      ) {
        return;
      }

      const rowKey =
        getRowIdentity(
          row,
          activeTab
        );

      try {
        setReviewingRowKey(
          rowKey
        );

        const token =
          await getToken();

        if (!token) {
          throw new Error(
            "Token not found"
          );
        }

        const payload = {
          report_type:
            isGroupTab
              ? REPORT_TYPES.GROUP
              : REPORT_TYPES.ONE_TO_ONE,

          review_status:
            reviewStatus,
        };

        if (isGroupTab) {
          payload.feedback_id =
            Number(
              row.feedbackId
            );
        } else {
          payload.sessionid =
            Number(
              row.sessionid
            );
        }

        const response =
          await axios.post(
            REVIEW_FEEDBACK_URL,
            payload,
            {
              headers: {
                ...BASE_HEADERS,
                token,
              },
            }
          );

        if (
          !isApiSuccess(response)
        ) {
          throw new Error(
            response?.data
              ?.message ||
              "Unable to review feedback."
          );
        }

        /*
         * Keep the current list in sync immediately.
         * For group reports the backend updates every
         * student feedback row in the same group session.
         */
        setRows(
          (previousRows) =>
            previousRows.map(
              (current) => {
                const shouldUpdate =
                  isGroupTab
                    ? Number(
                        current
                          .groupLiveSessionId
                      ) ===
                      Number(
                        row
                          .groupLiveSessionId
                      )
                    : Number(
                        current.sessionid
                      ) ===
                      Number(
                        row.sessionid
                      );

                return shouldUpdate
                  ? {
                      ...current,

                      review_status:
                        reviewStatus,
                    }
                  : current;
              }
            )
        );

        setCurrentRow(
          (previous) => {
            if (!previous) {
              return previous;
            }

            return {
              ...previous,

              review_status:
                reviewStatus,

              members:
                Array.isArray(
                  previous.members
                )
                  ? previous.members.map(
                      (member) => ({
                        ...member,

                        review_status:
                          reviewStatus,
                      })
                    )
                  : previous.members,
            };
          }
        );

        await Swal.fire({
          icon: "success",

          title: isApproving
            ? "Feedback Approved"
            : "Teacher Notified",

          text: isApproving
            ? "The feedback has been approved successfully."
            : "The feedback has been marked as not approved and the teacher has been notified by email.",

          timer: 2300,

          showConfirmButton:
            false,
        });

        setShowModal(false);

        setCurrentRow(null);

        /*
         * Reload from DB so the screen always reflects
         * the server result after the review action.
         */
        setReloadKey(
          (value) =>
            value + 1
        );
      } catch (error) {
        console.error(error);

        Swal.fire(
          "Review Failed",
          error?.response?.data
            ?.message ||
            error?.message ||
            "Something went wrong while reviewing the feedback.",
          "error"
        );
      } finally {
        setReviewingRowKey("");
      }
    };

  const getMissingGroupFields = (
    row
  ) =>
    GROUP_REQUIRED_FIELDS
      .filter(([field]) => {
        const value = row?.[field];

        return (
          value === null ||
          String(value ?? "").trim() ===
            ""
        );
      })
      .map(([, label]) => label);

  const handleSendEmail =
    async (row) => {
      const reviewStatus =
        getReviewStatus(row);

      /*
       * Frontend guard.
       * Backend also blocks unapproved reports,
       * so direct API calls remain protected too.
       */
      if (
        reviewStatus !==
        "approved"
      ) {
        return Swal.fire(
          "Approval Required",
          reviewStatus ===
            "not_approved"
            ? "This feedback has not been approved. The teacher must update it before the report can be sent."
            : "This feedback is awaiting admin approval.",
          "warning"
        );
      }

      if (isGroupTab) {
        const members =
          Array.isArray(row.members)
            ? row.members
            : [row];

        const pendingMembers =
          members.filter(
            (member) =>
              !isRowSent(member)
          );

        if (
          pendingMembers.length === 0
        ) {
          return Swal.fire(
            "Already Sent",
            "This group report has already been emailed to all students.",
            "info"
          );
        }

        if (
          pendingMembers.some(
            (member) =>
              !Number(
                member.feedbackId
              )
          )
        ) {
          return Swal.fire(
            "Error",
            "One or more group feedback IDs are missing.",
            "error"
          );
        }

        const incompleteMember =
          pendingMembers.find(
            (member) =>
              getMissingGroupFields(
                member
              ).length > 0
          );

        if (incompleteMember) {
          const missingFields =
            getMissingGroupFields(
              incompleteMember
            );

          return Swal.fire({
            title:
              "Complete the Report",

            html: `
              Please complete the following fields before sending:
              <br>
              <strong>${missingFields.join(
                ", "
              )}</strong>
            `,

            icon: "warning",
          });
        }

        const confirmation =
          await Swal.fire({
            title:
              row.hasPartialEmailSent
                ? "Retry Pending Reports?"
                : "Send Group Reports?",

            text: `Send this report separately to ${
              pendingMembers.length
            } pending student${
              pendingMembers.length ===
              1
                ? ""
                : "s"
            } in this group session?`,

            icon: "question",

            showCancelButton: true,

            confirmButtonText:
              row.hasPartialEmailSent
                ? "Yes, Retry Pending"
                : "Yes, Send All",

            cancelButtonText:
              "Cancel",
          });

        if (
          !confirmation.isConfirmed
        ) {
          return;
        }

        const rowKey =
          getRowIdentity(
            row,
            activeTab
          );

        try {
          setSendingRowKey(rowKey);

          const token =
            await getToken();

          if (!token) {
            throw new Error(
              "Token not found"
            );
          }

          const successfulUpdates =
            new Map();

          const failedStudents = [];

          for (
            const member of pendingMembers
          ) {
            try {
              const response =
                await axios.post(
                  SEND_GROUP_EMAIL_URL,
                  {
                    feedback_id:
                      Number(
                        member.feedbackId
                      ),
                  },
                  {
                    headers: {
                      ...BASE_HEADERS,
                      token,
                    },
                  }
                );

              if (
                !isApiSuccess(response)
              ) {
                throw new Error(
                  response?.data
                    ?.message ||
                    "Email delivery failed."
                );
              }

              successfulUpdates.set(
                Number(
                  member.feedbackId
                ),
                {
                  email_status:
                    "sent",

                  student_email_status:
                    response?.data
                      ?.data
                      ?.student_email_status ??
                    member
                      .student_email_status,

                  parent_email_status:
                    response?.data
                      ?.data
                      ?.parent_email_status ??
                    member
                      .parent_email_status,

                  isEmailSent: true,
                }
              );
            } catch (error) {
              console.error(error);

              failedStudents.push(
                member.studentName ||
                  `Feedback #${member.feedbackId}`
              );
            }
          }

          if (
            successfulUpdates.size >
            0
          ) {
            setRows(
              (previousRows) =>
                previousRows.map(
                  (current) => {
                    const update =
                      successfulUpdates.get(
                        Number(
                          current.feedbackId
                        )
                      );

                    return update
                      ? {
                          ...current,
                          ...update,
                        }
                      : current;
                  }
                )
            );
          }

          if (
            failedStudents.length ===
            0
          ) {
            await Swal.fire({
              icon: "success",

              title:
                "All Reports Sent",

              text: `The group report was sent successfully for all ${pendingMembers.length} pending students.`,

              timer: 2200,

              showConfirmButton:
                false,
            });
          } else {
            await Swal.fire({
              icon:
                successfulUpdates.size >
                0
                  ? "warning"
                  : "error",

              title:
                successfulUpdates.size >
                0
                  ? "Partially Sent"
                  : "Email Not Sent",

              text: `${
                successfulUpdates.size
              } sent, ${
                failedStudents.length
              } failed. Failed: ${failedStudents.join(
                ", "
              )}`,
            });

            setReloadKey(
              (value) => value + 1
            );
          }
        } catch (error) {
          console.error(error);

          Swal.fire(
            "Email Not Sent",
            error?.response?.data
              ?.message ||
              error?.message ||
              "Something went wrong while sending the group emails.",
            "error"
          );
        } finally {
          setSendingRowKey("");
        }

        return;
      }

      if (isRowSent(row)) {
        return Swal.fire(
          "Already Sent",
          "This progress report has already been emailed.",
          "info"
        );
      }

      if (!row.sessionid) {
        return Swal.fire(
          "Error",
          "Session ID is missing.",
          "error"
        );
      }

      const confirmation =
        await Swal.fire({
          title:
            "Send Progress Report?",

          text: `Send ${row.studentName}'s one-to-one progress report?`,

          icon: "question",

          showCancelButton: true,

          confirmButtonText:
            "Yes, Send",

          cancelButtonText:
            "Cancel",
        });

      if (
        !confirmation.isConfirmed
      ) {
        return;
      }

      const rowKey =
        getRowIdentity(
          row,
          activeTab
        );

      try {
        setSendingRowKey(rowKey);

        const token =
          await getToken();

        if (!token) {
          throw new Error(
            "Token not found"
          );
        }

        const response =
          await axios.post(
            SEND_ONE_TO_ONE_EMAIL_URL,
            {
              sessionid: Number(
                row.sessionid
              ),
            },
            {
              headers: {
                ...BASE_HEADERS,
                token,
              },
            }
          );

        if (
          !isApiSuccess(response)
        ) {
          throw new Error(
            response?.data?.message ||
              "Email delivery failed."
          );
        }

        setRows((previousRows) =>
          previousRows.map(
            (current) =>
              Number(
                current.sessionid
              ) ===
              Number(row.sessionid)
                ? {
                    ...current,

                    email_status:
                      "sent",

                    isEmailSent:
                      true,
                  }
                : current
          )
        );

        Swal.fire({
          icon: "success",

          title: "Sent",

          text:
            "The progress report was emailed successfully.",

          timer: 1900,

          showConfirmButton:
            false,
        });
      } catch (error) {
        console.error(error);

        Swal.fire(
          "Email Not Sent",
          error?.response?.data
            ?.message ||
            error?.message ||
            "Something went wrong while sending the email.",
          "error"
        );
      } finally {
        setSendingRowKey("");
      }
    };

  const modalThemeClass =
    "pf-dark";

  const tableColumnCount =
    isGroupTab ? 11 : 10;

  return (
    <div className="row gy-4">
      <style>{`
        .pf-tabs {
          display: inline-flex;
          gap: 6px;
          padding: 5px;
          border: 1px solid rgba(0, 0, 0, 0.08);
          border-radius: 12px;
          background: rgba(0, 0, 0, 0.035);
        }

        .pf-tab-button {
          border: 0;
          border-radius: 9px;
          padding: 9px 18px;
          background: transparent;
          color: inherit;
          font-weight: 600;
          transition: all 0.2s ease;
        }

        .pf-tab-button.active {
          background: #45b369;
          color: #ffffff;
          box-shadow: 0 5px 16px rgba(69, 179, 105, 0.25);
        }

        .pf-tab-button:disabled {
          cursor: not-allowed;
          opacity: 0.65;
        }

        .pf-table {
          min-width: 1040px;
        }

        .pf-table th,
        .pf-table td {
          vertical-align: middle;
          white-space: nowrap;
        }

        .pf-programme-cell {
          min-width: 190px;
          white-space: normal !important;
        }

        .pf-programme-cell small {
          display: block;
          margin-top: 2px;
          opacity: 0.72;
        }

        .pf-modal-card {
          border-radius: 14px;
          overflow: hidden;
          box-shadow: 0 14px 45px rgba(0, 0, 0, 0.18);
          border: 1px solid rgba(0, 0, 0, 0.06);
        }

        .pf-divider {
          border-top: 1px dashed rgba(0, 0, 0, 0.15);
          margin: 14px 0;
        }

        .pf-meta {
          border-radius: 12px;
          padding: 12px;
          border: 1px solid rgba(0, 0, 0, 0.06);
        }

        .pf-meta small {
          opacity: 0.75;
        }

        .pf-box {
          border-radius: 12px;
          padding: 12px;
          height: 100%;
          border: 1px solid rgba(0, 0, 0, 0.08);
          background: transparent;
        }

        .pf-box .form-label {
          font-weight: 600;
          font-size: 13px;
          margin-bottom: 6px;
        }

        .pf-modal-card.pf-dark {
          background: #1f2a3a !important;
          color: rgba(255, 255, 255, 0.92) !important;
          border-color: rgba(255, 255, 255, 0.08) !important;
        }

        .pf-modal-card.pf-dark .modal-header,
        .pf-modal-card.pf-dark .modal-body,
        .pf-modal-card.pf-dark .modal-footer {
          background: #1f2a3a !important;
          color: rgba(255, 255, 255, 0.92) !important;
        }

        .pf-modal-card.pf-dark .modal-header {
          border-bottom: 1px solid rgba(255, 255, 255, 0.1) !important;
        }

        .pf-modal-card.pf-dark .modal-footer {
          border-top: 1px solid rgba(255, 255, 255, 0.1) !important;
        }

        .pf-modal-card.pf-dark .modal-title {
          color: rgba(255, 255, 255, 0.95) !important;
        }

        .pf-modal-card.pf-dark .btn-close {
          filter: invert(1) grayscale(100%);
          opacity: 0.85;
        }

        .pf-modal-card.pf-dark .pf-meta {
          background: #263345 !important;
          color: rgba(255, 255, 255, 0.92) !important;
          border-color: rgba(255, 255, 255, 0.08) !important;
        }

        .pf-modal-card.pf-dark .pf-box {
          background: #202c3d !important;
          color: rgba(255, 255, 255, 0.92) !important;
          border-color: rgba(255, 255, 255, 0.1) !important;
        }

        .pf-modal-card.pf-dark small,
        .pf-modal-card.pf-dark label,
        .pf-modal-card.pf-dark .form-label,
        .pf-modal-card.pf-dark .fw-semibold {
          color: rgba(255, 255, 255, 0.92) !important;
        }

        .pf-modal-card.pf-dark .form-select,
        .pf-modal-card.pf-dark .form-control {
          background: #2a374a !important;
          color: #ffffff !important;
          -webkit-text-fill-color: #ffffff !important;
          border-color: rgba(255, 255, 255, 0.14) !important;
        }

        .pf-modal-card.pf-dark .form-control::placeholder {
          color: rgba(255, 255, 255, 0.55) !important;
          -webkit-text-fill-color: rgba(255, 255, 255, 0.55) !important;
        }

        .pf-modal-card.pf-dark .form-select:disabled,
        .pf-modal-card.pf-dark .form-control:disabled,
        .pf-modal-card.pf-dark textarea:disabled,
        .pf-modal-card.pf-dark input:disabled {
          background: #2a374a !important;
          color: #ffffff !important;
          -webkit-text-fill-color: #ffffff !important;
          opacity: 1 !important;
        }

        .pf-modal-card .form-select:disabled,
        .pf-modal-card .form-control:disabled,
        .pf-modal-card textarea:disabled,
        .pf-modal-card input:disabled {
          cursor: not-allowed;
        }

        @media (max-width: 767.98px) {
          .pf-tabs {
            display: flex;
            width: 100%;
          }

          .pf-tab-button {
            flex: 1;
            padding: 9px 10px;
            font-size: 13px;
          }

          .pf-filter-control {
            width: 100%;
            min-width: 100% !important;
          }

          .pf-pagination {
            width: 100%;
            justify-content: space-between;
          }
        }

        @keyframes pf-spin {
          from {
            transform: rotate(0deg);
          }

          to {
            transform: rotate(360deg);
          }
        }
      `}</style>

      <div className="col-xxl-12">
        <div className="card h-100 p-0 email-card">
          <div className="card-body p-0">
            <div className="px-3 pt-3">
              <div className="d-flex flex-wrap align-items-center justify-content-between gap-3">
                <div
                  className="pf-tabs"
                  role="tablist"
                >
                  <button
                    type="button"
                    className={`pf-tab-button ${
                      !isGroupTab
                        ? "active"
                        : ""
                    }`}
                    onClick={() =>
                      setActiveTab(
                        REPORT_TYPES.ONE_TO_ONE
                      )
                    }
                    disabled={
                      loading ||
                      Boolean(
                        sendingRowKey
                      ) ||
                      Boolean(
                        reviewingRowKey
                      ) ||
                      savingFeedback
                    }
                  >
                    One-to-One
                  </button>

                  <button
                    type="button"
                    className={`pf-tab-button ${
                      isGroupTab
                        ? "active"
                        : ""
                    }`}
                    onClick={() =>
                      setActiveTab(
                        REPORT_TYPES.GROUP
                      )
                    }
                    disabled={
                      loading ||
                      Boolean(
                        sendingRowKey
                      ) ||
                      Boolean(
                        reviewingRowKey
                      ) ||
                      savingFeedback
                    }
                  >
                    Group
                  </button>
                </div>

                <button
                  type="button"
                  className="btn btn-sm btn-outline-primary"
                  onClick={() =>
                    setReloadKey(
                      (value) =>
                        value + 1
                    )
                  }
                  disabled={
                    loading ||
                    Boolean(
                      sendingRowKey
                    ) ||
                    Boolean(
                      reviewingRowKey
                    ) ||
                    savingFeedback
                  }
                >
                  <Icon
                    icon="solar:refresh-linear"
                    className="me-1"
                  />

                  Refresh
                </button>
              </div>

              <hr className="my-3" />

              <div className="d-flex flex-wrap gap-2 align-items-end">
                <div
                  className="pf-filter-control"
                  style={{
                    minWidth: 240,
                  }}
                >
                  <input
                    className="form-control"
                    placeholder={
                      isGroupTab
                        ? "Search student, teacher or programme"
                        : "Search student, teacher or session"
                    }
                    value={search}
                    onChange={(event) =>
                      setSearch(
                        event.target.value
                      )
                    }
                  />
                </div>

                <div
                  className="pf-filter-control"
                  style={{
                    minWidth: 180,
                  }}
                >
                  <select
                    className="form-select"
                    value={statusFilter}
                    onChange={(event) =>
                      setStatusFilter(
                        event.target.value
                      )
                    }
                  >
                    <option value="all">
                      All Email Statuses
                    </option>

                    <option value="pending">
                      Pending
                    </option>

                    <option value="sent">
                      Sent
                    </option>
                  </select>
                </div>

                <div
                  className="pf-filter-control"
                  style={{
                    minWidth: 170,
                  }}
                >
                  <input
                    type="date"
                    className="form-control"
                    value={dateFrom}
                    onChange={(event) =>
                      setDateFrom(
                        event.target.value
                      )
                    }
                    title="From date"
                  />
                </div>

                <div
                  className="pf-filter-control"
                  style={{
                    minWidth: 170,
                  }}
                >
                  <input
                    type="date"
                    className="form-control"
                    value={dateTo}
                    onChange={(event) =>
                      setDateTo(
                        event.target.value
                      )
                    }
                    title="To date"
                  />
                </div>

                <button
                  type="button"
                  className="btn btn-outline-secondary pf-filter-control"
                  onClick={resetFilters}
                >
                  Reset Filters
                </button>
              </div>

              <hr className="my-3" />
            </div>

            <div className="table-responsive">
              <table className="table bordered-table sm-table mb-0 pf-table">
                <thead>
                  <tr>
                    <th className="text-center">
                      S.L
                    </th>

                    <th className="text-center">
                      Recording
                    </th>

                    <th className="text-center">
                      Book Date
                    </th>

                    <th className="text-center">
                      {isGroupTab
                        ? "Students"
                        : "Student Name"}
                    </th>

                    <th className="text-center">
                      Teacher Name
                    </th>

                    {isGroupTab && (
                      <th className="text-center">
                        Programme / Session
                      </th>
                    )}

                    <th className="text-center">
                      Slot Start
                    </th>

                    <th className="text-center">
                      Slot End
                    </th>

                    <th className="text-center">
                      Review Status
                    </th>

                    <th className="text-center">
                      Progress Report
                    </th>

                    <th className="text-center">
                      Send Email
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {loading ? (
                    <tr>
                      <td
                        colSpan={
                          tableColumnCount
                        }
                        className="text-center py-5"
                      >
                        <span
                          className="d-inline-block"
                          style={{
                            width: 36,
                            height: 36,

                            border:
                              "4px solid #e0e0e0",

                            borderTopColor:
                              "#45B369",

                            borderRadius:
                              "50%",

                            animation:
                              "pf-spin 1s linear infinite",
                          }}
                        />
                      </td>
                    </tr>
                  ) : currentRows.length ===
                    0 ? (
                    <tr>
                      <td
                        className="text-center py-4"
                        colSpan={
                          tableColumnCount
                        }
                      >
                        No{" "}
                        {isGroupTab
                          ? "group"
                          : "one-to-one"}{" "}
                        progress reports
                        found.
                      </td>
                    </tr>
                  ) : (
                    currentRows.map(
                      (row, index) => {
                        const isSent =
                          String(
                            row.email_status ||
                              ""
                          ).toLowerCase() ===
                            "sent" ||
                          row.isEmailSent;

                        const rowKey =
                          getRowIdentity(
                            row,
                            activeTab
                          );

                        const isSending =
                          sendingRowKey ===
                          rowKey;

                        const reviewMeta =
                          getReviewStatusMeta(
                            row
                          );

                        const isApproved =
                          reviewMeta.status ===
                          "approved";

                        const isNotApproved =
                          reviewMeta.status ===
                          "not_approved";

                        const recordingUrl =
                          normalizeUrl(
                            row.recordingUrl
                          );

                        return (
                          <tr key={rowKey}>
                            <td className="text-center">
                              {indexOfFirst +
                                index +
                                1}
                            </td>

                            <td className="text-center">
                              {recordingUrl ? (
                                <button
                                  type="button"
                                  className="btn btn-sm btn-outline-primary"
                                  onClick={() =>
                                    openRecording(
                                      row
                                    )
                                  }
                                >
                                  View
                                </button>
                              ) : (
                                "-"
                              )}
                            </td>

                            <td className="text-center">
                              {row.bookDate ||
                                "-"}
                            </td>

                            <td className="text-center">
                              {isGroupTab ? (
                                <>
                                  <strong>
                                    {
                                      row.memberCount
                                    }{" "}
                                    Student
                                    {row.memberCount ===
                                    1
                                      ? ""
                                      : "s"}
                                  </strong>

                                  <small className="d-block mt-1 opacity-75">
                                    {row.studentNames?.join(
                                      ", "
                                    ) ||
                                      "-"}
                                  </small>
                                </>
                              ) : (
                                row.studentName ||
                                "-"
                              )}
                            </td>

                            <td className="text-center">
                              {row.teacherName ||
                                "-"}
                            </td>

                            {isGroupTab && (
                              <td className="text-center pf-programme-cell">
                                <strong>
                                  {row.programmeName ||
                                    "-"}
                                </strong>

                                <small>
                                  {row.sessionTitle ||
                                    row.subjectName ||
                                    ""}
                                </small>
                              </td>
                            )}

                            <td className="text-center">
                              {row.slotStart ||
                                "-"}
                            </td>

                            <td className="text-center">
                              {row.slotEnd ||
                                "-"}
                            </td>

                            <td className="text-center">
                              <span
                                className={`badge ${reviewMeta.badgeClass}`}
                              >
                                {
                                  reviewMeta.label
                                }
                              </span>
                            </td>

                            <td className="text-center">
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-primary"
                                onClick={() =>
                                  openFeedbackModal(
                                    row
                                  )
                                }
                                title={
                                  isSent
                                    ? "View report (locked)"
                                    : "View or edit report"
                                }
                              >
                                <Icon icon="majesticons:eye-line" />
                              </button>
                            </td>

                            <td className="text-center">
                              <button
                                type="button"
                                className={`btn btn-sm ${
                                  !isApproved &&
                                  !isSent
                                    ? "btn-secondary"
                                    : row.hasPartialEmailSent
                                    ? "btn-warning"
                                    : "btn-success"
                                }`}
                                onClick={() =>
                                  handleSendEmail(
                                    row
                                  )
                                }
                                disabled={
                                  isSent ||
                                  isSending ||
                                  !isApproved
                                }
                                title={
                                  isSent
                                    ? isGroupTab
                                      ? "Already sent to all students"
                                      : "Already sent"
                                    : !isApproved
                                    ? isNotApproved
                                      ? "Feedback not approved"
                                      : "Awaiting admin approval"
                                    : row.hasPartialEmailSent
                                    ? "Retry pending students"
                                    : isGroupTab
                                    ? "Send to all students in this group session"
                                    : "Send progress report"
                                }
                              >
                                {isSent
                                  ? "Sent"
                                  : isSending
                                  ? "Sending..."
                                  : !isApproved
                                  ? isNotApproved
                                    ? "Not Approved"
                                    : "Pending Review"
                                  : row.hasPartialEmailSent
                                  ? "Retry Pending"
                                  : isGroupTab
                                  ? "Send All"
                                  : "Send"}
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

            <div className="d-flex flex-wrap justify-content-between align-items-center gap-3 mt-3 px-3 pb-3">
              <span>
                Showing{" "}
                {filteredSortedRows.length ===
                0
                  ? 0
                  : indexOfFirst + 1}{" "}
                to{" "}
                {Math.min(
                  indexOfLast,
                  filteredSortedRows.length
                )}{" "}
                of{" "}
                {
                  filteredSortedRows.length
                }{" "}
                entries
              </span>

              <div className="d-flex align-items-center gap-2 pf-pagination">
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
                    currentPage <= 1
                  }
                >
                  Previous
                </button>

                <span className="small">
                  Page {currentPage} of{" "}
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
                    currentPage >=
                    totalPages
                  }
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {isRecordingOpen && (
        <div
          className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center"
          style={{
            background:
              "rgba(0,0,0,0.6)",
            zIndex: 1060,
          }}
          role="dialog"
          aria-modal="true"
          onClick={closeRecording}
        >
          <div
            className="bg-white radius-12 p-16"
            style={{
              width:
                "min(900px, 92vw)",
            }}
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <div className="d-flex justify-content-between align-items-center mb-2">
              <h6 className="mb-0">
                Session Recording
              </h6>

              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                onClick={
                  closeRecording
                }
              >
                Close
              </button>
            </div>

            {activeRecordingUrl ? (
              <video
                controls
                autoPlay
                style={{
                  width: "100%",
                  maxHeight:
                    "70vh",
                  background: "#000",
                }}
              >
                <source
                  src={
                    activeRecordingUrl
                  }
                  type="video/mp4"
                />

                Your browser does not
                support the video tag.
              </video>
            ) : (
              <div className="text-center py-5">
                Recording not
                available.
              </div>
            )}
          </div>
        </div>
      )}

      {showModal && currentRow && (
        <div
          className="modal fade show"
          style={{
            display: "block",
            background:
              "rgba(0,0,0,0.5)",
          }}
          onClick={
            closeFeedbackModal
          }
        >
          <div
            className="modal-dialog modal-dialog-centered modal-lg"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <div
              className={`modal-content pf-modal-card ${modalThemeClass}`}
            >
              <div className="modal-header">
                <h5 className="modal-title">
                  {isGroupTab
                    ? "Group Progress Report"
                    : "One-to-One Progress Report"}
                </h5>

                <button
                  type="button"
                  className="btn-close"
                  onClick={
                    closeFeedbackModal
                  }
                />
              </div>

              <div className="modal-body">
                {(() => {
                  const isSent =
                    isGroupTab
                      ? Boolean(
                          currentRow.hasAnyEmailSent
                        )
                      : isRowSent(
                          currentRow
                        );

                  return (
                    <>
                      <div className="pf-meta">
                        <div className="row g-2">
                          <div className="col-md-6">
                            <small>
                              {isGroupTab
                                ? "Students"
                                : "Student"}
                            </small>

                            <div className="fw-semibold">
                              {currentRow.studentName ||
                                "-"}
                            </div>
                          </div>

                          <div className="col-md-6">
                            <small>
                              Teacher
                            </small>

                            <div className="fw-semibold">
                              {currentRow.teacherName ||
                                "-"}
                            </div>
                          </div>

                          {isGroupTab && (
                            <>
                              <div className="col-md-6 mt-2">
                                <small>
                                  Programme
                                </small>

                                <div className="fw-semibold">
                                  {currentRow.programmeName ||
                                    "-"}
                                </div>
                              </div>

                              <div className="col-md-6 mt-2">
                                <small>
                                  Session /
                                  Subject
                                </small>

                                <div className="fw-semibold">
                                  {currentRow.sessionTitle ||
                                    currentRow.subjectName ||
                                    "-"}
                                </div>
                              </div>
                            </>
                          )}
                        </div>

                        <div className="mt-2">
                          <small>
                            Email Status
                          </small>{" "}

                          <span
                            className={`badge ${
                              isSent
                                ? currentRow.hasPartialEmailSent
                                  ? "bg-warning text-dark"
                                  : "bg-success"
                                : "bg-warning text-dark"
                            }`}
                          >
                            {currentRow.hasPartialEmailSent
                              ? "Partially Sent"
                              : isSent
                              ? "Sent"
                              : "Pending"}
                          </span>
                        </div>

                        <div className="mt-2">
                          <small>
                            Review Status
                          </small>{" "}

                          {(() => {
                            const reviewMeta =
                              getReviewStatusMeta(
                                currentRow
                              );

                            return (
                              <span
                                className={`badge ${reviewMeta.badgeClass}`}
                              >
                                {
                                  reviewMeta.label
                                }
                              </span>
                            );
                          })()}
                        </div>
                      </div>

                      <div className="pf-divider" />

                      {isGroupTab ? (
                        <div className="row g-3">
                          <div className="col-md-4">
                            <div className="pf-box">
                              <label className="form-label">
                                Group Rating
                              </label>

                              <div className="d-flex align-items-center gap-1 mt-2">
                                {[
                                  1, 2, 3, 4,
                                  5,
                                ].map(
                                  (
                                    rating
                                  ) => {
                                    const isSelected =
                                      rating <=
                                      Number(
                                        currentRow.group_rating ||
                                          0
                                      );

                                    return (
                                      <button
                                        key={
                                          rating
                                        }
                                        type="button"
                                        className="btn border-0 bg-transparent p-0 shadow-none"
                                        disabled={
                                          isSent
                                        }
                                        onClick={() =>
                                          handleFeedbackChange(
                                            "group_rating",
                                            String(
                                              rating
                                            )
                                          )
                                        }
                                        aria-label={`${rating} out of 5 stars`}
                                        title={`${rating} out of 5`}
                                        style={{
                                          lineHeight: 1,
                                          opacity: 1,

                                          cursor:
                                            isSent
                                              ? "default"
                                              : "pointer",
                                        }}
                                      >
                                        <Icon
                                          icon={
                                            isSelected
                                              ? "material-symbols:star-rounded"
                                              : "material-symbols:star-outline-rounded"
                                          }
                                          width="35"
                                          height="35"
                                          style={{
                                            color:
                                              isSelected
                                                ? "#fbbf24"
                                                : "#64748b",
                                          }}
                                        />
                                      </button>
                                    );
                                  }
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="col-md-8">
                            <div className="pf-box">
                              <label className="form-label">
                                Topic Covered
                              </label>

                              <textarea
                                className="form-control"
                                rows="2"
                                value={
                                  currentRow.topic_covered
                                }
                                onChange={(
                                  event
                                ) =>
                                  handleFeedbackChange(
                                    "topic_covered",
                                    event
                                      .target
                                      .value
                                  )
                                }
                                placeholder="Summarise the topic covered in this group session."
                                disabled={
                                  isSent
                                }
                              />
                            </div>
                          </div>

                          <div className="col-12">
                            <div className="pf-box">
                              <label className="form-label">
                                Performance
                                Comment
                              </label>

                              <textarea
                                className="form-control"
                                rows="3"
                                value={
                                  currentRow.performance_comment
                                }
                                onChange={(
                                  event
                                ) =>
                                  handleFeedbackChange(
                                    "performance_comment",
                                    event
                                      .target
                                      .value
                                  )
                                }
                                placeholder="Provide a clear summary of the student's individual performance."
                                disabled={
                                  isSent
                                }
                              />
                            </div>
                          </div>

                          <div className="col-md-6">
                            <div className="pf-box">
                              <label className="form-label">
                                Highlights
                              </label>

                              <textarea
                                className="form-control"
                                rows="3"
                                value={
                                  currentRow.highlights
                                }
                                onChange={(
                                  event
                                ) =>
                                  handleFeedbackChange(
                                    "highlights",
                                    event
                                      .target
                                      .value
                                  )
                                }
                                placeholder="What did the student do particularly well?"
                                disabled={
                                  isSent
                                }
                              />
                            </div>
                          </div>

                          <div className="col-md-6">
                            <div className="pf-box">
                              <label className="form-label">
                                Development
                                Areas
                              </label>

                              <textarea
                                className="form-control"
                                rows="3"
                                value={
                                  currentRow.development_areas
                                }
                                onChange={(
                                  event
                                ) =>
                                  handleFeedbackChange(
                                    "development_areas",
                                    event
                                      .target
                                      .value
                                  )
                                }
                                placeholder="Identify the areas that need more attention."
                                disabled={
                                  isSent
                                }
                              />
                            </div>
                          </div>

                          <div className="col-md-6">
                            <div className="pf-box">
                              <label className="form-label">
                                Suggested
                                Practice
                              </label>

                              <textarea
                                className="form-control"
                                rows="3"
                                value={
                                  currentRow.suggested_practice
                                }
                                onChange={(
                                  event
                                ) =>
                                  handleFeedbackChange(
                                    "suggested_practice",
                                    event
                                      .target
                                      .value
                                  )
                                }
                                placeholder="Recommend focused practice before the next session."
                                disabled={
                                  isSent
                                }
                              />
                            </div>
                          </div>

                          <div className="col-md-6">
                            <div className="pf-box">
                              <label className="form-label">
                                Looking Ahead
                              </label>

                              <textarea
                                className="form-control"
                                rows="3"
                                value={
                                  currentRow.looking_ahead
                                }
                                onChange={(
                                  event
                                ) =>
                                  handleFeedbackChange(
                                    "looking_ahead",
                                    event
                                      .target
                                      .value
                                  )
                                }
                                placeholder="Explain what will be covered or improved next."
                                disabled={
                                  isSent
                                }
                              />
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="row g-3">
                          {ONE_TO_ONE_SELECT_FIELDS.map(
                            ({
                              field,
                              label,
                              className,
                            }) => (
                              <div
                                className={
                                  className
                                }
                                key={field}
                              >
                                <div className="pf-box">
                                  <label className="form-label">
                                    {
                                      label
                                    }
                                  </label>

                                  <select
                                    className="form-select"
                                    value={
                                      currentRow[
                                        field
                                      ]
                                    }
                                    onChange={(
                                      event
                                    ) =>
                                      handleFeedbackChange(
                                        field,
                                        event
                                          .target
                                          .value
                                      )
                                    }
                                    disabled={
                                      isSent
                                    }
                                  >
                                    <option value="">
                                      Select
                                    </option>

                                    {ENUM_OPTIONS.map(
                                      (
                                        option
                                      ) => (
                                        <option
                                          key={
                                            option
                                          }
                                          value={
                                            option
                                          }
                                        >
                                          {
                                            option
                                          }
                                        </option>
                                      )
                                    )}
                                  </select>
                                </div>
                              </div>
                            )
                          )}

                          {ONE_TO_ONE_TEXT_FIELDS.map(
                            ({
                              field,
                              label,
                              placeholder,
                            }) => (
                              <div
                                className="col-12"
                                key={field}
                              >
                                <div className="pf-box">
                                  <label className="form-label">
                                    {
                                      label
                                    }
                                  </label>

                                  <textarea
                                    className="form-control"
                                    rows="2"
                                    value={
                                      currentRow[
                                        field
                                      ]
                                    }
                                    onChange={(
                                      event
                                    ) =>
                                      handleFeedbackChange(
                                        field,
                                        event
                                          .target
                                          .value
                                      )
                                    }
                                    placeholder={
                                      placeholder
                                    }
                                    disabled={
                                      isSent
                                    }
                                  />
                                </div>
                              </div>
                            )
                          )}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={
                    closeFeedbackModal
                  }
                  disabled={
                    Boolean(
                      reviewingRowKey
                    )
                  }
                >
                  Close
                </button>

                {!(
                  isGroupTab
                    ? Boolean(
                        currentRow
                          .hasAnyEmailSent
                      )
                    : isRowSent(
                        currentRow
                      )
                ) && (
                  <>
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={() =>
                        handleReviewFeedback(
                          currentRow,
                          "not_approved"
                        )
                      }
                      disabled={
                        savingFeedback ||
                        Boolean(
                          reviewingRowKey
                        ) ||
                        getReviewStatus(
                          currentRow
                        ) ===
                          "not_approved"
                      }
                    >
                      {reviewingRowKey ===
                      getRowIdentity(
                        currentRow,
                        activeTab
                      )
                        ? "Processing..."
                        : "Not Approved"}
                    </button>

                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() =>
                        handleReviewFeedback(
                          currentRow,
                          "approved"
                        )
                      }
                      disabled={
                        savingFeedback ||
                        Boolean(
                          reviewingRowKey
                        ) ||
                        getReviewStatus(
                          currentRow
                        ) ===
                          "approved"
                      }
                    >
                      {reviewingRowKey ===
                      getRowIdentity(
                        currentRow,
                        activeTab
                      )
                        ? "Processing..."
                        : "Approve"}
                    </button>
                  </>
                )}

                <button
                  type="button"
                  className="btn btn-success"
                  onClick={
                    handleSaveFeedback
                  }
                  disabled={
                    savingFeedback ||
                    Boolean(
                      reviewingRowKey
                    ) ||
                    (isGroupTab
                      ? Boolean(
                          currentRow.hasAnyEmailSent
                        )
                      : isRowSent(
                          currentRow
                        ))
                  }
                >
                  {savingFeedback
                    ? "Saving..."
                    : "Save Report"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FeedbackLayer;