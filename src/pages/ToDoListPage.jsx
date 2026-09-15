import React from "react";
import MasterLayout from "../masterLayout/MasterLayout";
import Breadcrumb from "../components/Breadcrumb";
import ToDoListLayer from "../components/ToDoListLayer";

const ToDoListPage = () => {
  return (
    <>
      <MasterLayout>
        <Breadcrumb title="To Do List" />
        <ToDoListLayer />
      </MasterLayout>
    </>
  );
};

export default ToDoListPage;