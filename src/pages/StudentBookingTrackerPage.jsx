import React from "react";
import MasterLayout from "../masterLayout/MasterLayout";
import Breadcrumb from "../components/Breadcrumb";
import StudentBookingTrackerLayer from "../components/StudentBookingTrackerLayer";

const StudentBookingTrackerPage = () => {
  return (
    <MasterLayout>
      <Breadcrumb title="Student Booking Tracker" />
      <StudentBookingTrackerLayer />
    </MasterLayout>
  );
};

export default StudentBookingTrackerPage;
