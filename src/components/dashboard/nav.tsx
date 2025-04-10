import React from "react";
import AuthButton from "../auth/auth-button";
import CreditDisplay from "./credit-display";
import NavItems from "./nav-items";

const DashboardNav = () => {
  return (
    <nav className="grid gap-2 items-start">
      <NavItems />
      <div className="my-4 px-4 md:hidden">
        <AuthButton />
      </div>
      <div className="p-4">
        <CreditDisplay />
      </div>
    </nav>
  );
};

export default DashboardNav;
