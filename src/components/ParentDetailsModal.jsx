import React, { useState, useEffect } from "react";
import moment from "moment";
import axios from "axios";
import Swal from "sweetalert2";
import { getNationalities } from "../api/getNationalities";
import { getToken } from "../api/getToken";
import { uploadFileAws } from "../api/uploadFileAws";

const headers = {
  projectid: "1",
  userid: "test",
  password: "test",
  "x-api-key": "abc123456789",
};

const DEFAULT_AVATAR =
  "https://gostudy.ae/assets/person-dummy.jpg";

const FETCH_PROFILE_URL =
  "https://api.learnyourlanguage.org/RestController_Thirdparty.php?view=teacher_profile";
const UPDATE_PROFILE_URL =
  "https://api.learnyourlanguage.org/RestController_Thirdparty.php?view=update_user_profile";
const ADD_DYNAMIC_URL =
  "https://api.learnyourlanguage.org/RestController_Thirdparty.php?view=add_dynamic_data";

// helpers
function splitName(fullname = "") {
  const clean = String(fullname || "").trim().replace(/\s+/g, " ");
  if (!clean) return { firstname: "", lastname: "" };
  const parts = clean.split(" ");
  if (parts.length === 1) return { firstname: parts[0], lastname: "" };
  return { firstname: parts[0], lastname: parts.slice(1).join(" ") };
}
const toNumberOrEmpty = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : "";
};

const ParentDetailsModal = ({ show, onClose, userid, seed, onSave }) => {
  const [formData, setFormData] = useState({ active: "1" });
  const [nationalities, setNationalities] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasAdded, setHasAdded] = useState(false);
  const [selectedImagePreview, setSelectedImagePreview] = useState(null);

  const isAddMode = userid == null;
  const seedUserId = seed?.id;

  useEffect(() => {
    (async () => {
      try {
        const res = await getNationalities(); // [{id:"1", nationality:"American"}, ...]
        setNationalities(res || []);
      } catch (e) {
        console.error(e);
      }
    })();
  }, []);

  // Fetch (edit) / Prefill (add)
  useEffect(() => {
    if (!show) return;
    setHasAdded(false);

    if (isAddMode) {
      const { firstname, lastname } = splitName(seed?.fullname);
      setFormData({
        active: "1",
        userid: seedUserId,
        email: seed?.email || "",
        phonenumber: seed?.phonenumber || "",
        firstname,
        lastname,
        street: "",
        area: "",
        city: "",
        postcode: "",
        dob: "",
        nationalityid: "",   // user will select
        imagepath: "",
        gender: "",
        parentemail: "",
        timezoneid: -1,
      });
      return;
    }

    (async () => {
      setLoading(true);
      try {
        const token = await getToken();
        if (!token) throw new Error("Token not found");
        const res = await axios.post(
          FETCH_PROFILE_URL,
          { token, teacherid: userid },
          { headers }
        );
        if (res.data.statusCode === 200) {
          const profile = res.data.data.profile?.[0] || {};
          const natRaw = profile.nationalityid ?? profile.nationality ?? "";
          setFormData({
            ...profile,
            active: profile.active || "1",
            nationalityid: toNumberOrEmpty(natRaw), // store numeric
            gender: profile.gender || "",
            parentemail: profile.parentemail || "",
            timezoneid: profile.timezoneid ?? -1,
          });
        } else {
          Swal.fire("Error", res.data.message || "Failed to load profile", "error");
        }
      } catch (e) {
        console.error(e);
        Swal.fire("Error", "Failed to load profile", "error");
      } finally {
        setLoading(false);
      }
    })();
  }, [show, userid, isAddMode, seedUserId, seed]);

  if (!show) return null;

  // Handlers
  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === "nationalityid") {
      setFormData((p) => ({ ...p, nationalityid: toNumberOrEmpty(value) })); // ✅ keep number
      return;
    }
    setFormData((p) => ({ ...p, [name]: value }));
  };

  // image
  const handleImageChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setLoading(true);
    try {
      const uploadedPath = await uploadFileAws(file);
      if (uploadedPath) {
        setSelectedImagePreview(URL.createObjectURL(file));
        setFormData((prev) => ({ ...prev, imagepath: uploadedPath }));
        Swal.fire("Uploaded!", "Image uploaded successfully.", "success");
      } else {
        Swal.fire("Upload Failed", "Image could not be uploaded.", "error");
      }
    } catch (err) {
      console.error(err);
      Swal.fire("Error", "Something went wrong during upload.", "error");
    } finally {
      setLoading(false);
    }
  };

  // payloads
  const buildUpdatePayload = () => ({
    userdetail: [
      {
        id: formData.id,
        userid: formData.userid || seedUserId,
        firstname: formData.firstname,
        lastname: formData.lastname,
        email: formData.email,
        parentemail: formData.parentemail,
        phonenumber: formData.phonenumber,
        nationality: Number(formData.nationalityid), // UPDATE still expects "nationality"
        dob: formData.dob,
        street: formData.street,
        area: formData.area,
        city: formData.city,
        postcode: formData.postcode,
        imagepath: formData.imagepath || "",
        gender: formData.gender || "",
        timezoneid: formData.timezoneid ?? -1,
        passportid: formData.passportid || "",
      },
    ],
  });

  // ✅ ADD → backend needs "nationalityid" (INT), NOT "nationality"
  const buildAddDynamicPayload = (token) => {
    const natId = Number(formData.nationalityid);
    return {
      token,
      tablename: "userdetail",
      userid: Number(formData.userid || seedUserId),
      firstname: formData.firstname || "",
      lastname: formData.lastname || "",
      area: formData.area || "",
      city: formData.city || "",
      dob: formData.dob || "",
      email: formData.email || "",
      gender: formData.gender || "",
      imagepath: formData.imagepath || "",
      nationalityid: natId,                 // ✅ exact key + integer value
      parentemail: formData.parentemail || "",
      passportid: formData.passportid || "",
      phonenumber: formData.phonenumber || "",
      postcode: formData.postcode || "",
      street: formData.street || "",
      timezoneid: formData.timezoneid ?? -1,
    };
  };

  const validateAdd = () => {
    if (!formData.userid) return "Missing userid";
    if (!formData.firstname) return "First name is required";
    if (!formData.email) return "Email is required";
    if (!formData.phonenumber) return "Phone number is required";
    if (!Number.isFinite(Number(formData.nationalityid)))
      return "Please select a nationality";
    return null;
  };

  const handleSave = async () => {
    if (saving) return;
    if (isAddMode && hasAdded) return;

    setSaving(true);
    try {
      const token = await getToken();
      if (!token) throw new Error("Token not found");

      let res;
      if (isAddMode) {
        const err = validateAdd();
        if (err) {
          setSaving(false);
          return Swal.fire("Validation", err, "warning");
        }
        const body = buildAddDynamicPayload(token);
        // console.log("ADD body", body, typeof body.nationalityid);
        res = await axios.post(ADD_DYNAMIC_URL, body, { headers });
      } else {
        const body = { token, ...buildUpdatePayload() };
        res = await axios.post(UPDATE_PROFILE_URL, body, { headers });
      }

      const ok = res?.data?.statusCode === 200 || res?.data?.success;
      if (ok) {
        if (isAddMode) setHasAdded(true);

        Swal.fire({
          icon: "success",
          title: isAddMode ? "Parent details added!" : "Parent profile updated!",
          timer: 1600,
          showConfirmButton: false,
        });

        const nationality_name =
          (nationalities.find((n) => String(n.id) === String(formData.nationalityid)) || {})
            .nationality;

        onSave?.({
          ...formData,
          userid: formData.userid || seedUserId,
          nationalityid: Number(formData.nationalityid), // ✅ keep numeric back to list
          nationality_name,
        });

        onClose();
      } else {
        Swal.fire({
          icon: "error",
          title: "Failed",
          text: res?.data?.message || "❌ Unknown error occurred",
        });
      }
    } catch (error) {
      console.error("Save error:", error);
      Swal.fire({
        icon: "error",
        title: "Error",
        text: isAddMode ? "❌ Error adding parent details" : "❌ Error updating parent profile",
      });
    } finally {
      setSaving(false);
    }
  };

  const avatarSrc = selectedImagePreview || formData.imagepath || DEFAULT_AVATAR;

  return (
    <div className="modal fade show d-block" style={{ background: "rgba(0,0,0,0.5)" }}>
      <div className="modal-dialog modal-lg modal-dialog-centered">
        <div className="modal-content radius-12">
          <div className="modal-header border-secondary">
            <h5 className="modal-title">
              {isAddMode ? "Add Parent Details" : "Edit Parent Details"}
            </h5>
            <button type="button" className="btn-close" onClick={onClose}></button>
          </div>

          <div className="modal-body">
            {loading ? (
              <p>Loading...</p>
            ) : (
              <>
                <div className="text-center mb-4">
                  <img
                    src={avatarSrc}
                    onError={(e) => { e.currentTarget.src = DEFAULT_AVATAR; }}
                    alt="Parent"
                    className="img-thumbnail rounded mb-3"
                    style={{
                      width: "150px",
                      height: "150px",
                      objectFit: "cover",
                      borderRadius: "12px",
                      border: "2px solid #3f413fff",
                    }}
                  />
                  <div>
                    <label
                      htmlFor="parentImage"
                      className="btn btn-outline-primary d-inline-flex align-items-center justify-content-center gap-2"
                      style={{ padding: "6px 16px", fontSize: "0.9rem", borderRadius: "6px", cursor: "pointer", fontWeight: "500" }}
                    >
                      <i className="bi bi-camera" style={{ fontSize: "1rem" }}></i>
                      Upload Profile Image
                    </label>
                    <input type="file" id="parentImage" accept="image/*" onChange={handleImageChange} style={{ display: "none" }} />
                  </div>

                  {!isAddMode && (
                    <>
                      <h5 className="mt-3">{`${formData.firstname || ""} ${formData.lastname || ""}`}</h5>
                      <p className="mb-1">
                        Status:{" "}
                        <span className={`badge ${String(formData.active) === "1" ? "bg-success" : "bg-danger"}`}>
                          {String(formData.active) === "1" ? "Active" : "Inactive"}
                        </span>
                      </p>
                      <p className="mb-1">
                        Joined:{" "}
                        {formData.createddate ? moment(formData.createddate).format("DD MMM YYYY") : "N/A"}
                      </p>
                    </>
                  )}
                </div>

                <div className="row g-2">
                  <div className="col-md-6">
                    <label className="form-label">First Name</label>
                    <input type="text" name="firstname" value={formData.firstname || ""} onChange={handleChange} className="form-control" />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label">Last Name</label>
                    <input type="text" name="lastname" value={formData.lastname || ""} onChange={handleChange} className="form-control" />
                  </div>

                  <div className="col-md-6">
                    <label className="form-label">Email</label>
                    <input type="email" name="email" value={formData.email || ""} onChange={handleChange} className="form-control" />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label">Phone Number</label>
                    <input type="text" name="phonenumber" value={formData.phonenumber || ""} onChange={handleChange} className="form-control" />
                  </div>

                  <div className="col-md-6">
                    <label className="form-label">Nationality</label>
                    <select
                      className="form-control"
                      name="nationalityid"
                      value={formData.nationalityid === "" ? "" : String(formData.nationalityid)}
                      onChange={handleChange}
                    >
                      <option value="">Select Nationality</option>
                      {nationalities.map((n) => (
                        <option key={n.id} value={Number(n.id)}>
                          {n.nationality}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="col-md-6">
                    <label className="form-label">Gender</label>
                    <select className="form-control" name="gender" value={formData.gender || ""} onChange={handleChange}>
                      <option value="">Select Gender</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>

                  <div className="col-md-6">
                    <label className="form-label">Date of Birth</label>
                    <input type="date" name="dob" value={formData.dob || ""} onChange={handleChange} className="form-control" />
                  </div>

                  <div className="col-12 mt-3">
                    <h6>Address</h6>
                    <div className="row g-2">
                      <div className="col-md-6">
                        <input type="text" name="street" placeholder="Street" value={formData.street || ""} onChange={handleChange} className="form-control" />
                      </div>
                      <div className="col-md-6">
                        <input type="text" name="area" placeholder="Area" value={formData.area || ""} onChange={handleChange} className="form-control" />
                      </div>
                      <div className="col-md-6">
                        <input type="text" name="city" placeholder="City" value={formData.city || ""} onChange={handleChange} className="form-control" />
                      </div>
                      <div className="col-md-6">
                        <input type="text" name="postcode" placeholder="Postcode" value={formData.postcode || ""} onChange={handleChange} className="form-control" />
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={onClose} disabled={saving}>Close</button>
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={saving || (isAddMode && hasAdded)}
            >
              {isAddMode
                ? hasAdded
                  ? "Saved"
                  : (saving ? "Creating..." : "Add Details")
                : (saving ? "Saving..." : "Save Changes")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ParentDetailsModal;
