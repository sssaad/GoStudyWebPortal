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

const RUN_SP_URL =
  "https://api.learnyourlanguage.org/RestController_Thirdparty.php?view=runStoredProcedure";

const UPDATE_DYNAMIC_URL =
  "https://api.learnyourlanguage.org/RestController_Thirdparty.php?view=update_dynamic_data";

const ADD_DYNAMIC_URL =
  "https://api.learnyourlanguage.org/RestController_Thirdparty.php?view=add_dynamic_data";

const STORED_PROCEDURE_NAME = "get_rating_review_with_recordings";
const PER_PAGE = 15;

const DATE_FORMATS = [
  "YYYY-MM-DD",
  "YYYY/MM/DD",
  "YYYY-MM-DD HH:mm:ss",
  "YYYY-MM-DDTHH:mm:ss",
  "DD MMM YYYY",
  moment.ISO_8601,
];

const TIME_FORMATS = ["HH:mm:ss", "HH:mm", "hh:mm A", "h:mm A"];

const normalizeUrl = (value) => {
  const url = String(value || "")
    .replace(/\\\//g, "/")
    .replace(/&amp;/g, "&")
    .trim();

  /*
   * Path ke duplicate slashes remove karta hai,
   * lekin https:// ko safe rakhta hai.
   */
  return url.replace(/([^:]\/)\/+/g, "$1");
};

const clampRating = (value) => {
  const rating = Number.parseFloat(value) || 0;
  return Math.max(0, Math.min(5, rating));
};

const parseDate = (value) => {
  if (!value) return null;

  let parsed = moment(String(value).trim(), DATE_FORMATS, true);

  if (!parsed.isValid()) {
    parsed = moment(value);
  }

  return parsed.isValid() ? parsed : null;
};

const parseTime = (value) => {
  if (!value) return null;

  let parsed = moment(String(value).trim(), TIME_FORMATS, true);

  if (!parsed.isValid()) {
    parsed = moment(value);
  }

  return parsed.isValid() ? parsed : null;
};

const formatDate = (value) => {
  const parsed = parseDate(value);

  return parsed
    ? parsed.format("DD MMM YYYY")
    : value
      ? String(value)
      : "";
};

const formatTime = (value) => {
  const parsed = parseTime(value);

  return parsed
    ? parsed.format("hh:mm A")
    : value
      ? String(value)
      : "";
};

const getDateKey = (value) => {
  const parsed = parseDate(value);
  return parsed ? parsed.format("YYYY-MM-DD") : "";
};

const getBookDateTs = (value) => {
  const parsed = parseDate(value);
  return parsed ? parsed.valueOf() : 0;
};

const getTimeMinutes = (value) => {
  const parsed = parseTime(value);

  return parsed
    ? parsed.hours() * 60 + parsed.minutes()
    : -1;
};

/*
 * Stored procedure booking_date, booking_start_time
 * aur booking_end_time Asia/Dubai mein return karti hai.
 *
 * +04:00 explicitly lagane se comparison browser/user
 * timezone se independent rahega.
 */
const buildDubaiDateTimeTs = (rawDate, rawTime) => {
  const dateKey = getDateKey(rawDate);
  const parsedTime = parseTime(rawTime);

  if (!dateKey || !parsedTime) {
    return 0;
  }

  const timeKey = parsedTime.format("HH:mm:ss");

  return moment
    .parseZone(`${dateKey}T${timeKey}+04:00`)
    .valueOf();
};

const hasSessionEndedInDubai = (row) => {
  const sessionEndTs = Number(row?.sessionEndTs || 0);

  if (!sessionEndTs) {
    /*
     * End date/time missing ho to row hide rahegi.
     * Is se ongoing ya incomplete booking galti se
     * review list mein appear nahi hogi.
     */
    return false;
  }

  return sessionEndTs <= Date.now();
};

/*
 * Existing JSX compatibility ke liye function name
 * same rakha hai. Lekin ab date ke bajaye complete
 * Dubai session end datetime check hota hai.
 */
const isFutureDubaiBooking = (row) =>
  !hasSessionEndedInDubai(row);

const getRowDisabledReason = (row) => {
  if (!hasSessionEndedInDubai(row)) {
    return "Rating and review will be available after the session ends in Dubai time.";
  }

  if (!row?.bookingid) {
    return "Booking information is missing.";
  }

  if (
    !row?.studentid ||
    !String(row?.studentName || "").trim()
  ) {
    return "Student information is missing for this booking.";
  }

  if (
    !row?.teacherid ||
    !String(row?.teacherName || "").trim()
  ) {
    return "Teacher information is missing for this booking.";
  }

  return "";
};

const detectIsDark = () => {
  try {
    const body = document.body;

    const byAttribute =
      body?.dataset?.theme?.toLowerCase() === "dark" ||
      body
        ?.getAttribute("data-theme")
        ?.toLowerCase() === "dark";

    const byClass =
      body?.classList?.contains("dark") ||
      body?.classList?.contains("theme-dark") ||
      body?.classList?.contains("dark-mode") ||
      body?.classList?.contains("bg-dark");

    if (byAttribute || byClass) {
      return true;
    }

    const background =
      window.getComputedStyle(body).backgroundColor;

    const values = background.match(/\d+/g);

    if (values?.length >= 3) {
      const [red, green, blue] = values.map(Number);

      const brightness =
        (red * 299 + green * 587 + blue * 114) /
        1000;

      return brightness < 128;
    }

    return Boolean(
      window.matchMedia?.(
        "(prefers-color-scheme: dark)"
      )?.matches
    );
  } catch {
    return false;
  }
};

const isSuccessResponse = (response) => {
  const statusCode = Number(
    response?.data?.statusCode || 0
  );

  const message = String(
    response?.data?.message || ""
  ).toLowerCase();

  return (
    statusCode === 200 ||
    statusCode === 201 ||
    response?.data?.success === true ||
    message.includes("success")
  );
};

const StudentfeedbackLayer = () => {
  const [rows, setRows] = useState([]);
  const [initialLoading, setInitialLoading] =
    useState(true);

  const [showReviewModal, setShowReviewModal] =
    useState(false);

  const [currentRow, setCurrentRow] =
    useState(null);

  const [savingReview, setSavingReview] =
    useState(false);

  const [publishingId, setPublishingId] =
    useState(null);

  const [
    showRecordingModal,
    setShowRecordingModal,
  ] = useState(false);

  const [
    activeRecordingUrl,
    setActiveRecordingUrl,
  ] = useState("");

  const [currentPage, setCurrentPage] =
    useState(1);

  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [publishFilter, setPublishFilter] =
    useState("all");

  const [isDarkTheme, setIsDarkTheme] =
    useState(false);

  const resetFilters = () => {
    setSearch("");
    setDateFrom("");
    setDateTo("");
    setPublishFilter("all");
    setCurrentPage(1);
  };

  useEffect(() => {
    const updateTheme = () => {
      setIsDarkTheme(detectIsDark());
    };

    updateTheme();

    const observer = new MutationObserver(
      updateTheme
    );

    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["class", "data-theme"],
    });

    const mediaQuery = window.matchMedia?.(
      "(prefers-color-scheme: dark)"
    );

    mediaQuery?.addEventListener?.(
      "change",
      updateTheme
    );

    return () => {
      observer.disconnect();

      mediaQuery?.removeEventListener?.(
        "change",
        updateTheme
      );
    };
  }, []);

  useEffect(() => {
    const fetchRows = async () => {
      try {
        setInitialLoading(true);

        const token = await getToken();

        if (!token) {
          throw new Error("Token not found");
        }

        const response = await axios.post(
          RUN_SP_URL,
          {
            procedureName:
              STORED_PROCEDURE_NAME,
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

        if (!Array.isArray(data)) {
          setRows([]);
          return;
        }

        const mappedRows = data.map(
          (item, index) => {
            const rawBookDate =
              item.booking_date ??
              item.bookdate ??
              item.book_date ??
              item.bookDate ??
              "";

            const rawStart =
              item.booking_start_time ??
              item.slot_start ??
              item.slot1_time ??
              item.slotStart ??
              "";

            const rawEnd =
              item.booking_end_time ??
              item.slot_end ??
              item.slot2_time ??
              item.slotEnd ??
              "";

            const studentNameFromDetails = [
              item.student_firstname,
              item.student_lastname,
            ]
              .filter(Boolean)
              .join(" ")
              .trim();

            const teacherNameFromDetails = [
              item.teacher_firstname,
              item.teacher_lastname,
            ]
              .filter(Boolean)
              .join(" ")
              .trim();

            const bookingid =
              Number(item.bookingid || 0) ||
              null;

            const studentid =
              Number(item.studentid || 0) ||
              null;

            const teacherid =
              Number(item.teacherid || 0) ||
              null;

            const ratingReviewId =
              Number(
                item.rating_review_id ||
                item.id ||
                0
              ) || null;

            const studentName = String(
              studentNameFromDetails ||
              item.student_fullname ||
              item.student_name ||
              item.studentName ||
              ""
            ).trim();

            const teacherName = String(
              teacherNameFromDetails ||
              item.teacher_fullname ||
              item.teacher_name ||
              item.teacherName ||
              ""
            ).trim();

            const recordingUrl = normalizeUrl(
              item.s3Url ??
              item.s3_url ??
              item.recording_s3_url ??
              item.recordingUrl ??
              item.recording_url ??
              item.s3Key ??
              ""
            );

            const hasRatingReview =
              Boolean(ratingReviewId) ||
              Number(
                item.has_rating_review || 0
              ) === 1;

            return {
              key: bookingid
                ? `booking-${bookingid}`
                : `row-${index}`,

              bookingid,
              studentid,
              teacherid,
              ratingReviewId,
              hasRatingReview,

              recordingUrl,

              bookDate: formatDate(
                rawBookDate
              ),

              bookDateRaw: rawBookDate,

              bookDateKey:
                getDateKey(rawBookDate),

              bookDateTs:
                getBookDateTs(rawBookDate),

              /*
 * Dubai absolute timestamps.
 * Start sorting ke liye aur end visibility ke liye.
 */
              sessionTs: buildDubaiDateTimeTs(
                rawBookDate,
                rawStart
              ),

              sessionEndTs: buildDubaiDateTimeTs(
                rawBookDate,
                rawEnd
              ),

              slotStart: formatTime(rawStart),
              slotEnd: formatTime(rawEnd),

              studentName,
              teacherName,

              studentEmail:
                item.student_email ?? "",

              teacherEmail:
                item.teacher_email ?? "",

              subjectName:
                item.subjectname ??
                item.subject_name ??
                "",

              rating: clampRating(item.rating),

              review: item.review ?? "",

              publishedOnWeb: Number(
                item.published_on_web || 0
              ),

              publishStatusLabel:
                hasRatingReview
                  ? Number(
                    item.published_on_web ||
                    0
                  ) === 1
                    ? "Published"
                    : "Unpublished"
                  : "Not Added",

              isGroupBooking:
                Number(
                  item.is_group_booking || 0
                ) === 1,
            };
          }
        );

        /*
         * One booking = one row.
         * In case the stored procedure accidentally
         * returns duplicate joins, keep the row
         * containing a recording.
         */
        const uniqueByBooking = new Map();

        mappedRows.forEach((row) => {
          const uniqueKey = row.bookingid
            ? `booking-${row.bookingid}`
            : row.key;

          const existing =
            uniqueByBooking.get(uniqueKey);

          if (!existing) {
            uniqueByBooking.set(
              uniqueKey,
              row
            );

            return;
          }

          const existingHasRecording =
            Boolean(
              normalizeUrl(
                existing.recordingUrl
              )
            );

          const currentHasRecording =
            Boolean(
              normalizeUrl(row.recordingUrl)
            );

          if (
            !existingHasRecording &&
            currentHasRecording
          ) {
            uniqueByBooking.set(
              uniqueKey,
              row
            );

            return;
          }

          if (
            existingHasRecording ===
            currentHasRecording &&
            Number(row.sessionTs || 0) >
            Number(existing.sessionTs || 0)
          ) {
            uniqueByBooking.set(
              uniqueKey,
              row
            );
          }
        });

        setRows(
          Array.from(uniqueByBooking.values())
        );

        setCurrentPage(1);
      } catch (error) {
        console.error(
          "Rating/review list error:",
          error
        );

        setRows([]);

        Swal.fire(
          "Error",
          error?.response?.data?.message ||
          error?.message ||
          "Failed to load rating and review records.",
          "error"
        );
      } finally {
        setInitialLoading(false);
      }
    };

    fetchRows();
  }, []);

  const filteredSortedRows = useMemo(() => {
    const fromTimestamp = dateFrom
      ? moment(dateFrom, "YYYY-MM-DD")
        .startOf("day")
        .valueOf()
      : null;

    const toTimestamp = dateTo
      ? moment(dateTo, "YYYY-MM-DD")
        .endOf("day")
        .valueOf()
      : null;

    const query = String(search || "")
      .trim()
      .toLowerCase();

    return [...rows]
      .filter((row) => {
        /*
         * Future aur currently running sessions
         * bilkul list mein show nahi hongi.
         *
         * Row sirf Dubai slot end ke baad appear hogi.
         */
        if (!hasSessionEndedInDubai(row)) {
          return false;
        }

        const targetTimestamp = Number(
          row.sessionTs ||
          row.bookDateTs ||
          0
        );

        if (
          fromTimestamp !== null ||
          toTimestamp !== null
        ) {
          if (!targetTimestamp) {
            return false;
          }

          if (
            fromTimestamp !== null &&
            targetTimestamp < fromTimestamp
          ) {
            return false;
          }

          if (
            toTimestamp !== null &&
            targetTimestamp > toTimestamp
          ) {
            return false;
          }
        }

        if (
          publishFilter === "published" &&
          Number(
            row.publishedOnWeb || 0
          ) !== 1
        ) {
          return false;
        }

        if (
          publishFilter ===
          "unpublished" &&
          (
            !row.hasRatingReview ||
            Number(
              row.publishedOnWeb || 0
            ) === 1
          )
        ) {
          return false;
        }

        if (query) {
          const searchableText = [
            row.bookingid,
            row.bookDate,
            row.studentName,
            row.teacherName,
            row.slotStart,
            row.slotEnd,
            row.subjectName,
          ]
            .join(" ")
            .toLowerCase();

          if (
            !searchableText.includes(query)
          ) {
            return false;
          }
        }

        return true;
      })
      .sort((first, second) => {
        const firstTimestamp = Number(
          first.sessionTs ||
          first.bookDateTs ||
          0
        );

        const secondTimestamp = Number(
          second.sessionTs ||
          second.bookDateTs ||
          0
        );

        if (
          secondTimestamp !==
          firstTimestamp
        ) {
          return (
            secondTimestamp -
            firstTimestamp
          );
        }

        return (
          Number(second.bookingid || 0) -
          Number(first.bookingid || 0)
        );
      });
  }, [
    rows,
    search,
    dateFrom,
    dateTo,
    publishFilter,
  ]);

  const totalPages = Math.max(
    1,
    Math.ceil(
      filteredSortedRows.length /
      PER_PAGE
    )
  );

  const indexOfFirst =
    (currentPage - 1) * PER_PAGE;

  const indexOfLast =
    currentPage * PER_PAGE;

  const currentRows =
    filteredSortedRows.slice(
      indexOfFirst,
      indexOfLast
    );

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  useEffect(() => {
    setCurrentPage(1);
  }, [
    search,
    dateFrom,
    dateTo,
    publishFilter,
  ]);

  const openRecording = (row) => {
    if (isFutureDubaiBooking(row)) {
      Swal.fire(
        "Upcoming Booking",
        "Recording is disabled until the booking date.",
        "info"
      );

      return;
    }

    const url = normalizeUrl(row?.recordingUrl);

    if (!url) {
      Swal.fire(
        "Recording Unavailable",
        "Recording URL is not available for this booking.",
        "warning"
      );

      return;
    }

    setActiveRecordingUrl(url);
    setShowRecordingModal(true);
  };

  const closeRecording = () => {
    setShowRecordingModal(false);
    setActiveRecordingUrl("");
  };

  const openReviewModal = (row) => {
    const disabledReason =
      getRowDisabledReason(row);

    if (disabledReason) {
      Swal.fire(
        "Action Unavailable",
        disabledReason,
        "info"
      );

      return;
    }

    setCurrentRow({
      ...row,

      rating: row.hasRatingReview
        ? clampRating(row.rating)
        : 0,

      review: row.hasRatingReview
        ? String(row.review || "")
        : "",
    });

    setShowReviewModal(true);
  };

  const closeReviewModal = () => {
    if (savingReview) {
      return;
    }

    setShowReviewModal(false);
    setCurrentRow(null);
  };

  const handlePublishToggle = async (
    row
  ) => {
    const disabledReason =
      getRowDisabledReason(row);

    if (disabledReason) {
      Swal.fire(
        "Action Unavailable",
        disabledReason,
        "info"
      );

      return;
    }

    if (
      !row?.ratingReviewId ||
      !row?.hasRatingReview
    ) {
      Swal.fire(
        "Review Not Added",
        "Please add a rating before changing the website status.",
        "warning"
      );

      return;
    }

    const nextValue =
      Number(row.publishedOnWeb || 0) ===
        1
        ? 0
        : 1;

    const confirmation =
      await Swal.fire({
        title:
          nextValue === 1
            ? "Publish Review?"
            : "Unpublish Review?",

        text:
          nextValue === 1
            ? "This rating and review will be visible on the website."
            : "This rating and review will be hidden from the website.",

        icon: "question",
        showCancelButton: true,

        confirmButtonText:
          nextValue === 1
            ? "Yes, Publish"
            : "Yes, Unpublish",

        cancelButtonText: "Cancel",
      });

    if (!confirmation.isConfirmed) {
      return;
    }

    try {
      setPublishingId(
        row.ratingReviewId
      );

      const token = await getToken();

      if (!token) {
        throw new Error(
          "Token not found"
        );
      }

      const response =
        await axios.post(
          UPDATE_DYNAMIC_URL,
          {
            token,
            tablename: "rating_review",

            conditions: [
              {
                id: Number(
                  row.ratingReviewId
                ),
              },
            ],

            updatedata: [
              {
                published_on_web:
                  nextValue,
              },
            ],
          },
          {
            headers: BASE_HEADERS,
          }
        );

      if (!isSuccessResponse(response)) {
        throw new Error(
          response?.data?.message ||
          "Failed to update website status."
        );
      }

      setRows((previousRows) =>
        previousRows.map((item) =>
          Number(
            item.ratingReviewId
          ) ===
            Number(
              row.ratingReviewId
            )
            ? {
              ...item,

              publishedOnWeb:
                nextValue,

              publishStatusLabel:
                nextValue === 1
                  ? "Published"
                  : "Unpublished",
            }
            : item
        )
      );

      Swal.fire(
        "Updated!",
        nextValue === 1
          ? "Review published on the website successfully."
          : "Review unpublished from the website successfully.",
        "success"
      );
    } catch (error) {
      console.error(
        "Publish status error:",
        error
      );

      Swal.fire(
        "Error",
        error?.response?.data?.message ||
        error?.message ||
        "Something went wrong while updating website status.",
        "error"
      );
    } finally {
      setPublishingId(null);
    }
  };

  const handleSaveReview = async () => {
    const disabledReason =
      getRowDisabledReason(currentRow);

    if (disabledReason) {
      Swal.fire(
        "Action Unavailable",
        disabledReason,
        "info"
      );

      return;
    }

    const rating = clampRating(
      currentRow?.rating
    );

    const review = String(
      currentRow?.review || ""
    ).trim();

    const isEdit = Boolean(
      currentRow?.ratingReviewId
    );

    if (rating <= 0) {
      Swal.fire(
        "Rating Required",
        "Please select a rating before saving.",
        "warning"
      );

      return;
    }

    const confirmation =
      await Swal.fire({
        title: isEdit
          ? "Update Rating & Review?"
          : "Add Rating & Review?",

        text: isEdit
          ? "Do you want to update this rating and review?"
          : "This rating and review will be added against the selected booking.",

        icon: "question",
        showCancelButton: true,

        confirmButtonText: isEdit
          ? "Yes, Update"
          : "Yes, Add",

        cancelButtonText: "Cancel",
      });

    if (!confirmation.isConfirmed) {
      return;
    }

    try {
      setSavingReview(true);

      const token = await getToken();

      if (!token) {
        throw new Error(
          "Token not found"
        );
      }

      Swal.fire({
        title: isEdit
          ? "Updating..."
          : "Adding...",

        allowOutsideClick: false,

        didOpen: () =>
          Swal.showLoading(),
      });

      let response;

      let savedRatingReviewId =
        currentRow.ratingReviewId;

      if (isEdit) {
        response = await axios.post(
          UPDATE_DYNAMIC_URL,
          {
            token,

            tablename:
              "rating_review",

            conditions: [
              {
                id: Number(
                  currentRow.ratingReviewId
                ),
              },
            ],

            updatedata: [
              {
                rating,
                review,
              },
            ],
          },
          {
            headers: BASE_HEADERS,
          }
        );
      } else {
        /*
         * Important:
         * add_dynamic_data inserts all payload
         * fields except tablename.
         *
         * Therefore token is sent in headers,
         * not inside the insert payload.
         */
        response = await axios.post(
          ADD_DYNAMIC_URL,
          {
            tablename:
              "rating_review",

            bookingid: Number(
              currentRow.bookingid
            ),

            teacherid: Number(
              currentRow.teacherid
            ),

            studentid: Number(
              currentRow.studentid
            ),

            rating,
            review,

            published_on_web: 0,
          },
          {
            headers: {
              ...BASE_HEADERS,
              token,

              "Content-Type":
                "application/json",
            },
          }
        );

        savedRatingReviewId =
          Number(
            response?.data?.data?.id ??
            response?.data?.id ??
            response?.data?.data
              ?.insert_id ??
            0
          ) || null;
      }

      if (!isSuccessResponse(response)) {
        throw new Error(
          response?.data?.message ||
          `Failed to ${isEdit
            ? "update"
            : "add"
          } rating and review.`
        );
      }

      if (
        !isEdit &&
        !savedRatingReviewId
      ) {
        throw new Error(
          "Rating was added, but the new rating ID was not returned. Please refresh the page."
        );
      }

      setRows((previousRows) =>
        previousRows.map((item) =>
          Number(item.bookingid) ===
            Number(currentRow.bookingid)
            ? {
              ...item,

              ratingReviewId: Number(
                savedRatingReviewId
              ),

              hasRatingReview: true,

              rating,
              review,

              publishedOnWeb: isEdit
                ? Number(
                  item.publishedOnWeb ||
                  0
                )
                : 0,

              publishStatusLabel:
                isEdit
                  ? item.publishStatusLabel
                  : "Unpublished",
            }
            : item
        )
      );

      await Swal.fire(
        isEdit
          ? "Updated!"
          : "Added!",

        isEdit
          ? "Rating and review updated successfully."
          : "Rating and review added successfully.",

        "success"
      );

      setShowReviewModal(false);
      setCurrentRow(null);
    } catch (error) {
      console.error(
        "Save rating/review error:",
        error
      );

      Swal.fire(
        "Error",
        error?.response?.data?.message ||
        error?.message ||
        "Something went wrong while saving rating and review.",
        "error"
      );
    } finally {
      setSavingReview(false);
    }
  };

  const renderStars = (
    value,
    onChange,
    disabled = false,
    size = 26
  ) => {
    const rating =
      clampRating(value);

    return (
      <div className="d-flex align-items-center gap-1 flex-wrap">
        {[1, 2, 3, 4, 5].map(
          (star) => {
            let icon =
              "mdi:star-outline";

            if (rating >= star) {
              icon = "mdi:star";
            } else if (
              rating >= star - 0.5
            ) {
              icon =
                "mdi:star-half-full";
            }

            return (
              <button
                key={star}
                type="button"
                className="rr-star-button"
                disabled={disabled}
                onClick={(event) => {
                  if (disabled) {
                    return;
                  }

                  const {
                    left,
                    width,
                  } =
                    event.currentTarget.getBoundingClientRect();

                  const clickedValue =
                    event.clientX - left <
                      width / 2
                      ? star - 0.5
                      : star;

                  onChange?.(
                    clickedValue
                  );
                }}
                style={{
                  fontSize: `${size}px`,

                  cursor: disabled
                    ? "default"
                    : "pointer",
                }}
                aria-label={`${star} star`}
              >
                <Icon icon={icon} />
              </button>
            );
          }
        )}
      </div>
    );
  };

  const modalThemeClass =
    isDarkTheme
      ? "rr-dark"
      : "rr-light";

  if (initialLoading) {
    return (
      <div
        className="d-flex justify-content-center align-items-center"
        style={{
          height: "300px",
        }}
      >
        <div className="rr-loader" />

        <style>{`
          .rr-loader {
            width: 48px;
            height: 48px;
            border: 6px solid #e0e0e0;
            border-top-color: #45b369;
            border-radius: 50%;
            animation: rrSpin 1s linear infinite;
          }

          @keyframes rrSpin {
            to {
              transform: rotate(360deg);
            }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="row gy-4">
      <style>{`
        .rr-table-row {
          transition:
            background-color .2s ease,
            opacity .2s ease;
        }

        .rr-table-row:hover {
          background:
            rgba(13, 110, 253, .035);
        }

        .rr-table-row.is-locked {
          opacity: .72;
        }

        .rr-date-wrap {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 5px;
        }

        .rr-status-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
          min-height: 28px;
          padding: 5px 10px;
          border: 1px solid transparent;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 700;
          white-space: nowrap;
        }

        .rr-status-badge.upcoming {
          color: #8a5a00;
          background:
            rgba(255, 193, 7, .14);
          border-color:
            rgba(255, 193, 7, .28);
        }

        .rr-status-badge.missing {
          color: #b42318;
          background:
            rgba(220, 53, 69, .10);
          border-color:
            rgba(220, 53, 69, .22);
        }

        .rr-status-badge.not-added {
          color: #5c667a;
          background:
            rgba(108, 117, 125, .11);
          border-color:
            rgba(108, 117, 125, .23);
        }

        .rr-recording-button,
        .rr-action-button {
          border-radius: 8px;
          font-weight: 600;
        }

        .rr-action-button {
          min-width: 105px;
        }

        .rr-publish-toggle {
          min-width: 132px;
          height: 34px;
          padding:
            4px 7px 4px 12px;
          display: inline-flex;
          align-items: center;
          justify-content:
            space-between;
          gap: 8px;
          border:
            1px solid
            rgba(108, 117, 125, .35);
          border-radius: 999px;
          background:
            rgba(108, 117, 125, .12);
          color: #6c757d;
          font-size: 12px;
          font-weight: 700;
          line-height: 1;
          transition: .2s ease;
        }

        .rr-publish-toggle:hover:not(:disabled) {
          transform:
            translateY(-1px);
          background:
            rgba(108, 117, 125, .18);
        }

        .rr-publish-toggle:disabled {
          opacity: .65;
          cursor: not-allowed;
        }

        .rr-publish-switch {
          width: 34px;
          height: 18px;
          position: relative;
          flex: 0 0 auto;
          border-radius: 999px;
          background: #8b95a5;
          transition: .2s ease;
        }

        .rr-publish-dot {
          width: 14px;
          height: 14px;
          position: absolute;
          top: 2px;
          left: 2px;
          border-radius: 50%;
          background: #fff;
          box-shadow:
            0 1px 4px
            rgba(0, 0, 0, .22);
          transition: .2s ease;
        }

        .rr-publish-toggle.is-published {
          color: #45b369;
          border-color:
            rgba(69, 179, 105, .35);
          background:
            rgba(69, 179, 105, .12);
        }

        .rr-publish-toggle.is-published
        .rr-publish-switch {
          background: #45b369;
        }

        .rr-publish-toggle.is-published
        .rr-publish-dot {
          left: 18px;
        }

        .rr-star-button {
          padding: 0;
          border: none;
          background: transparent;
          color: #f5b301;
          line-height: 1;
        }

        .rr-star-button:disabled {
          opacity: 1;
        }

        .rr-modal-card {
          overflow: hidden;
          border-radius: 14px;
          border:
            1px solid
            rgba(0, 0, 0, .06);
          box-shadow:
            0 14px 45px
            rgba(0, 0, 0, .18);
        }

        .rr-meta,
        .rr-box {
          padding: 14px;
          border-radius: 12px;
          border:
            1px solid
            rgba(0, 0, 0, .08);
        }

        .rr-box .form-label {
          margin-bottom: 8px;
          font-size: 13px;
          font-weight: 600;
        }

        .rr-divider {
          margin: 14px 0;
          border-top:
            1px dashed
            rgba(0, 0, 0, .18);
        }

        .rr-light {
          color:
            rgba(0, 0, 0, .88);
          background: #fff;
        }

        .rr-light .rr-meta {
          background:
            rgba(0, 0, 0, .03);
        }

        .rr-dark {
          color:
            rgba(255, 255, 255, .92);
          background: #1f2a3a;
          border-color:
            rgba(255, 255, 255, .08);
        }

        .rr-dark .modal-header {
          border-bottom-color:
            rgba(255, 255, 255, .10);
        }

        .rr-dark .modal-title {
          color:
            rgba(255, 255, 255, .95);
        }

        .rr-dark .btn-close {
          filter:
            invert(1)
            grayscale(100%);
        }

        .rr-dark .rr-meta,
        .rr-dark .rr-box {
          border-color:
            rgba(255, 255, 255, .10);
          background:
            rgba(255, 255, 255, .04);
        }

        .rr-dark .rr-divider {
          border-top-color:
            rgba(255, 255, 255, .16);
        }

        .rr-dark .form-control {
          color:
            rgba(255, 255, 255, .92);
          border-color:
            rgba(255, 255, 255, .12);
          background:
            rgba(255, 255, 255, .06);
        }
        
                .rr-pagination-wrap {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          margin-top: 0;
          padding: 14px 24px;
          border-top:
            1px solid
            rgba(255, 255, 255, .08);
          border-radius: 0 0 12px 12px;
          background: #26364a;
          color: #f1f5f9;
          font-size: 14px;
        }

        .rr-pagination-actions {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-left: auto;
        }

        .rr-page-button {
          min-width: 88px;
          min-height: 40px;
          padding: 8px 14px;
          border:
            1px solid
            rgba(203, 213, 225, .28);
          border-radius: 6px;
          background: transparent;
          color: #dbe5f0;
          font-size: 14px;
          font-weight: 500;
          transition: all .2s ease;
        }

        .rr-page-button:hover:not(:disabled) {
          border-color: #60a5fa;
          background:
            rgba(96, 165, 250, .12);
          color: #fff;
        }

        .rr-page-button:disabled {
          cursor: not-allowed;
          opacity: .42;
        }

        .rr-page-counter {
          min-width: 78px;
          color: #fff;
          font-weight: 600;
          text-align: center;
          white-space: nowrap;
        }

              @media (max-width: 767px) {
          .rr-pagination-wrap {
            flex-direction: column;
            align-items: stretch;
            padding: 14px;
          }

          .rr-pagination-actions {
            justify-content: space-between;
            margin-left: 0;
          }

          .rr-page-button {
            min-width: 76px;
          }
        }
      `}</style>

      <div className="col-xxl-12">
        <div className="card h-100 p-0 email-card">
          <div className="card-body p-0">
            <div className="px-3 pt-3">
              <div className="d-flex flex-wrap gap-2 align-items-end">
                <div
                  style={{
                    minWidth: 240,
                  }}
                >
                  <label className="form-label small fw-semibold">
                    Search
                  </label>

                  <input
                    className="form-control"
                    placeholder="Booking, student, teacher or subject"
                    value={search}
                    onChange={(event) =>
                      setSearch(
                        event.target.value
                      )
                    }
                  />
                </div>

                <div
                  style={{
                    minWidth: 170,
                  }}
                >
                  <label className="form-label small fw-semibold">
                    From Date
                  </label>

                  <input
                    type="date"
                    className="form-control"
                    value={dateFrom}
                    onChange={(event) =>
                      setDateFrom(
                        event.target.value
                      )
                    }
                  />
                </div>

                <div
                  style={{
                    minWidth: 170,
                  }}
                >
                  <label className="form-label small fw-semibold">
                    To Date
                  </label>

                  <input
                    type="date"
                    className="form-control"
                    value={dateTo}
                    onChange={(event) =>
                      setDateTo(
                        event.target.value
                      )
                    }
                  />
                </div>

                <div
                  style={{
                    minWidth: 190,
                  }}
                >
                  <label className="form-label small fw-semibold">
                    Web Status
                  </label>

                  <select
                    className="form-select"
                    value={publishFilter}
                    onChange={(event) =>
                      setPublishFilter(
                        event.target.value
                      )
                    }
                  >
                    <option value="all">
                      All Web Status
                    </option>

                    <option value="published">
                      Published
                    </option>

                    <option value="unpublished">
                      Unpublished
                    </option>
                  </select>
                </div>

                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={resetFilters}
                >
                  <Icon
                    icon="mdi:filter-remove-outline"
                    className="me-1"
                  />

                  Reset Filters
                </button>
              </div>

              <hr className="my-3" />
            </div>

            <div className="table-responsive">
              <table className="table bordered-table sm-table mb-0 align-middle">
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
                      Student Name
                    </th>

                    <th className="text-center">
                      Teacher Name
                    </th>

                    <th className="text-center">
                      Slot Start
                    </th>

                    <th className="text-center">
                      Slot End
                    </th>

                    <th className="text-center">
                      Rating
                    </th>

                    <th className="text-center">
                      Web Status
                    </th>

                    <th className="text-center">
                      Action
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {currentRows.length ===
                    0 ? (
                    <tr>
                      <td
                        className="text-center py-4"
                        colSpan={10}
                      >
                        No records found.
                      </td>
                    </tr>
                  ) : (
                    currentRows.map(
                      (row, index) => {
                        const recordingUrl =
                          normalizeUrl(
                            row.recordingUrl
                          );

                        const isFuture =
                          isFutureDubaiBooking(
                            row
                          );

                        const missingStudent =
                          !row.studentid ||
                          !String(
                            row.studentName ||
                            ""
                          ).trim();

                        const missingTeacher =
                          !row.teacherid ||
                          !String(
                            row.teacherName ||
                            ""
                          ).trim();

                        const disabledReason =
                          getRowDisabledReason(
                            row
                          );

                        const actionDisabled =
                          Boolean(
                            disabledReason
                          );

                        let actionLabel =
                          row.hasRatingReview
                            ? "View / Edit"
                            : "Add";

                        let actionIcon =
                          row.hasRatingReview
                            ? "majesticons:eye-line"
                            : "mdi:plus-circle-outline";

                        if (isFuture) {
                          actionLabel =
                            "Locked";

                          actionIcon =
                            "mdi:lock-outline";
                        } else if (
                          missingStudent ||
                          missingTeacher
                        ) {
                          actionLabel =
                            "Unavailable";

                          actionIcon =
                            "mdi:alert-circle-outline";
                        }

                        return (
                          <tr
                            key={
                              row.key ||
                              `booking-${row.bookingid}-${index}`
                            }
                            className={`rr-table-row ${actionDisabled
                              ? "is-locked"
                              : ""
                              }`}
                          >
                            <td className="text-center">
                              {indexOfFirst +
                                index +
                                1}
                            </td>

                            <td className="text-center">
                              {recordingUrl ? (
                                <button
                                  type="button"
                                  className="btn btn-sm btn-outline-primary rr-recording-button"
                                  onClick={() =>
                                    openRecording(
                                      row
                                    )
                                  }
                                  disabled={
                                    isFuture
                                  }
                                  title={
                                    isFuture
                                      ? "Recording is disabled for upcoming bookings."
                                      : "View Recording"
                                  }
                                >
                                  <Icon
                                    icon={
                                      isFuture
                                        ? "mdi:lock-outline"
                                        : "mdi:play-circle-outline"
                                    }
                                    className="me-1"
                                  />

                                  {isFuture
                                    ? "Locked"
                                    : "View"}
                                </button>
                              ) : (
                                <span className="text-muted">
                                  -
                                </span>
                              )}
                            </td>

                            <td className="text-center">
                              <div className="rr-date-wrap">
                                <span>
                                  {row.bookDate ||
                                    "-"}
                                </span>

                                {isFuture && (
                                  <span className="rr-status-badge upcoming">
                                    <Icon icon="mdi:clock-outline" />

                                    Upcoming
                                  </span>
                                )}
                              </div>
                            </td>

                            <td className="text-center">
                              {missingStudent ? (
                                <span className="rr-status-badge missing">
                                  <Icon icon="mdi:account-alert-outline" />

                                  Student Missing
                                </span>
                              ) : (
                                row.studentName
                              )}
                            </td>

                            <td className="text-center">
                              {missingTeacher ? (
                                <span className="rr-status-badge missing">
                                  <Icon icon="mdi:account-alert-outline" />

                                  Teacher Missing
                                </span>
                              ) : (
                                row.teacherName
                              )}
                            </td>

                            <td className="text-center">
                              {row.slotStart ||
                                "-"}
                            </td>

                            <td className="text-center">
                              {row.slotEnd ||
                                "-"}
                            </td>

                            <td className="text-center">
                              <div className="d-flex justify-content-center">
                                {row.hasRatingReview &&
                                  row.rating > 0 ? (
                                  renderStars(
                                    row.rating,
                                    null,
                                    true,
                                    18
                                  )
                                ) : (
                                  <span className="rr-status-badge not-added">
                                    <Icon icon="mdi:star-off-outline" />

                                    Not Added
                                  </span>
                                )}
                              </div>
                            </td>

                            <td className="text-center">
                              {isFuture ? (
                                <span className="rr-status-badge upcoming">
                                  <Icon icon="mdi:lock-outline" />

                                  Locked
                                </span>
                              ) : missingStudent ||
                                missingTeacher ? (
                                <span className="rr-status-badge missing">
                                  <Icon icon="mdi:alert-circle-outline" />

                                  Unavailable
                                </span>
                              ) : !row.hasRatingReview ||
                                !row.ratingReviewId ? (
                                <span className="rr-status-badge not-added">
                                  <Icon icon="mdi:web-off" />

                                  Review Not Added
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  className={`rr-publish-toggle ${Number(
                                    row.publishedOnWeb ||
                                    0
                                  ) === 1
                                    ? "is-published"
                                    : ""
                                    }`}
                                  disabled={
                                    Number(
                                      publishingId
                                    ) ===
                                    Number(
                                      row.ratingReviewId
                                    )
                                  }
                                  onClick={() =>
                                    handlePublishToggle(
                                      row
                                    )
                                  }
                                >
                                  <span>
                                    {Number(
                                      row.publishedOnWeb ||
                                      0
                                    ) === 1
                                      ? "Published"
                                      : "Unpublished"}
                                  </span>

                                  <span className="rr-publish-switch">
                                    <span className="rr-publish-dot" />
                                  </span>
                                </button>
                              )}
                            </td>

                            <td className="text-center">
                              <button
                                type="button"
                                className={`btn btn-sm rr-action-button ${row.hasRatingReview
                                  ? "btn-outline-primary"
                                  : "btn-outline-success"
                                  }`}
                                onClick={() =>
                                  openReviewModal(
                                    row
                                  )
                                }
                                disabled={
                                  actionDisabled
                                }
                                title={
                                  disabledReason ||
                                  (row.hasRatingReview
                                    ? "View or edit rating and review"
                                    : "Add rating and review")
                                }
                              >
                                <Icon
                                  icon={
                                    actionIcon
                                  }
                                  className="me-1"
                                />

                                {actionLabel}
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

            <div className="rr-pagination-wrap">
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

              <div className="rr-pagination-actions">
                <button
                  type="button"
                  className="rr-page-button"
                  onClick={() =>
                    setCurrentPage((page) =>
                      Math.max(1, page - 1)
                    )
                  }
                  disabled={currentPage <= 1}
                >
                  Previous
                </button>

                <span className="rr-page-counter">
                  Page {currentPage} of {totalPages}
                </span>

                <button
                  type="button"
                  className="rr-page-button"
                  onClick={() =>
                    setCurrentPage((page) =>
                      Math.min(totalPages, page + 1)
                    )
                  }
                  disabled={currentPage >= totalPages}
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showRecordingModal && (
        <div
          className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center"
          style={{
            background:
              "rgba(0,0,0,.65)",

            zIndex: 1060,
          }}
          role="dialog"
          aria-modal="true"
          onClick={closeRecording}
        >
          <div
            className="bg-white rounded-4 p-3 shadow-lg"
            style={{
              width:
                "min(900px, 92vw)",
            }}
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h5 className="mb-0">
                Class Recording
              </h5>

              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                onClick={closeRecording}
              >
                <Icon
                  icon="mdi:close"
                  className="me-1"
                />

                Close
              </button>
            </div>

            {activeRecordingUrl ? (
              <video
                key={activeRecordingUrl}
                controls
                autoPlay
                playsInline
                preload="metadata"
                style={{
                  width: "100%",
                  maxHeight: "70vh",
                  borderRadius: "10px",
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
                Recording not available.
              </div>
            )}
          </div>
        </div>
      )}

      {showReviewModal && (
        <div
          className="modal fade show"
          style={{
            display: "block",

            background:
              "rgba(0,0,0,.55)",
          }}
          onClick={closeReviewModal}
        >
          <div
            className="modal-dialog modal-dialog-centered modal-lg"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <div
              className={`modal-content rr-modal-card ${modalThemeClass}`}
            >
              <div className="modal-header">
                <h5 className="modal-title">
                  {currentRow?.hasRatingReview
                    ? "View / Edit Rating & Review"
                    : "Add Rating & Review"}
                </h5>

                <button
                  type="button"
                  className="btn-close"
                  onClick={
                    closeReviewModal
                  }
                  disabled={
                    savingReview
                  }
                />
              </div>

              <div className="modal-body">
                {currentRow && (
                  <>
                    <div className="rr-meta">
                      <div className="row g-3">
                        <div className="col-md-6">
                          <small className="opacity-75">
                            Student
                          </small>

                          <div className="fw-semibold">
                            {currentRow.studentName ||
                              "-"}
                          </div>
                        </div>

                        <div className="col-md-6">
                          <small className="opacity-75">
                            Teacher
                          </small>

                          <div className="fw-semibold">
                            {currentRow.teacherName ||
                              "-"}
                          </div>
                        </div>

                        <div className="col-md-4">
                          <small className="opacity-75">
                            Book Date
                          </small>

                          <div className="fw-semibold">
                            {currentRow.bookDate ||
                              "-"}
                          </div>
                        </div>

                        <div className="col-md-4">
                          <small className="opacity-75">
                            Slot Start
                          </small>

                          <div className="fw-semibold">
                            {currentRow.slotStart ||
                              "-"}
                          </div>
                        </div>

                        <div className="col-md-4">
                          <small className="opacity-75">
                            Slot End
                          </small>

                          <div className="fw-semibold">
                            {currentRow.slotEnd ||
                              "-"}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="rr-divider" />

                    <div className="row g-3">
                      <div className="col-12">
                        <div className="rr-box">
                          <label className="form-label d-block">
                            Rating
                          </label>

                          {renderStars(
                            currentRow.rating,

                            (value) =>
                              setCurrentRow(
                                (
                                  previous
                                ) => ({
                                  ...previous,

                                  rating:
                                    clampRating(
                                      value
                                    ),
                                })
                              ),

                            false,

                            36
                          )}

                          <div className="mt-2 fw-semibold">
                            Selected Rating:{" "}
                            {clampRating(
                              currentRow.rating
                            )}
                            /5
                          </div>
                        </div>
                      </div>

                      <div className="col-12">
                        <div className="rr-box">
                          <label className="form-label">
                            Review
                          </label>

                          <textarea
                            className="form-control"
                            rows={5}
                            value={
                              currentRow.review
                            }
                            onChange={(
                              event
                            ) =>
                              setCurrentRow(
                                (
                                  previous
                                ) => ({
                                  ...previous,

                                  review:
                                    event
                                      .target
                                      .value,
                                })
                              )
                            }
                            placeholder="Write review here..."
                          />
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={
                    closeReviewModal
                  }
                  disabled={
                    savingReview
                  }
                >
                  Close
                </button>

                <button
                  type="button"
                  className="btn btn-success"
                  onClick={
                    handleSaveReview
                  }
                  disabled={
                    savingReview
                  }
                >
                  {savingReview ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2" />

                      Saving...
                    </>
                  ) : currentRow?.hasRatingReview ? (
                    "Update Rating & Review"
                  ) : (
                    "Add Rating & Review"
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentfeedbackLayer;