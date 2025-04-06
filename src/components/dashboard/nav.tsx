"use client";
import { navItems } from "@/config/nav";
import React from "react";
import { Button } from "../ui/button";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const DashboardNav = () => {
  const pathname = usePathname();
  return (
    <nav className="grid gap-2 items-start">
      {navItems.map((item) => (
        <Button
          key={item.href}
          variant={pathname === item.href ? "secondary" : "ghost"}
          className={cn("justify-start", pathname === item.href && "bg-accent")}
          asChild
        >
          <Link href={item.href}>
            {item.icon && <item.icon className="h-4 w-4 mr-2" />}
            {item.title}
          </Link>
        </Button>
      ))}
    </nav>
  );
};

export default DashboardNav;
