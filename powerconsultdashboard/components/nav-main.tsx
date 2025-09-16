// "use client";

import {
  IconCirclePlusFilled,
  IconCurrencyDollar,
  IconMail,
  type Icon,
} from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import SidebarNavItem, {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { CurrencyIcon } from "lucide-react";

export function NavMain({
  items,
}: {
  items: {
    title: string;
    url: string;
    icon?: Icon;
  }[];
}) {
  const router = useRouter();

  // useEffect(() => {}, [router.])

  return (
    <SidebarGroup>
      <SidebarGroupContent className="flex flex-col gap-2">
        <SidebarMenu></SidebarMenu>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarNavItem
                icon={<IconCurrencyDollar />}
                href={item.url}
                label={item.title}
                exact
                variant="default"
                size="default"
              />
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
