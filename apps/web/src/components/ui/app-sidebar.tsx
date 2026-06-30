"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  CreditCard,
  ArrowLeftRight,
  Users,
  LogOut,
  FileSearchCorner
} from "lucide-react";
import { useDisconnect } from "wagmi";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import CopyText from "@/components/ui/copy";
import { truncateAddress } from "@/utils/format";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,

} from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";

export type AppView = "payments" | "audits" | "transactions" | "contacts";

const navItems: {
  id: AppView;
  title: string;
  icon: React.ElementType;
}[] = [
  { id: "payments", title: "Payments", icon: CreditCard },
  { id: "audits", title: "Audits", icon: FileSearchCorner },
  { id: "transactions", title: "Transactions", icon: ArrowLeftRight },
  { id: "contacts", title: "Contacts", icon: Users },
];

type AppSidebarProps = {
  walletAddress?: string;
  activeView: AppView;
  onNavigate: (view: AppView) => void;
  /** When true, all nav items are disabled until setup is complete */
  isLocked?: boolean;
  /** Called synchronously before wagmi's disconnect() — use to wipe localStorage */
  onBeforeDisconnect?: () => void;
} & React.ComponentProps<typeof Sidebar>;

export function AppSidebar({
  walletAddress,
  activeView,
  onNavigate,
  isLocked = false,
  onBeforeDisconnect,
  ...props
}: AppSidebarProps) {
  const router = useRouter();
  const { disconnect } = useDisconnect({
    mutation: {
      onSuccess: () => {
        router.push("/");
      },
    },
  });

  const handleDisconnect = () => {
    // Clear our localStorage keys FIRST so wagmi can't auto-reconnect
    onBeforeDisconnect?.();
    disconnect();
  };

  return (
    <Sidebar collapsible="icon" {...props}>
      {/* Logo */}
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
             
              className="md:h-12 md:p-0  hover:bg-transparent active:bg-transparent"
              onClick={() => router.push("/")}
              tooltip="Go home"
            >
              <div className="flex aspect-square size-6 items-center justify-center shrink-0">
                <Image
                  src="/complyrlogo-light.svg"
                  alt="Complyr"
                  width={32}
                  height={32}
                  className="h-5 w-auto"
                />
              </div>
              <span className="font-bold r text-lg truncate">
                Complyr
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>



      {/* Nav items */}
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.id}>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger
                        className={isLocked ? "cursor-not-allowed w-full" : "w-full"}
                        render={<span />}
                      >
                        <SidebarMenuButton
                          isActive={!isLocked && activeView === item.id}
                          onClick={() => !isLocked && onNavigate(item.id)}
                          tooltip={isLocked ? undefined : item.title}
                          className={`gap-3 py-5 mt-1 rounded transition-opacity w-full ${
                            isLocked
                              ? "opacity-40 pointer-events-none select-none"
                              : ""
                          }`}
                          aria-disabled={isLocked}
                        >
                          <item.icon className="shrink-0" />
                          <span>{item.title}</span>
                        </SidebarMenuButton>
                      </TooltipTrigger>
                      {isLocked && (
                        <TooltipContent side="right">
                          <p className="text-xs">Complete setup to unlock</p>
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </TooltipProvider>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* Footer — wallet + disconnect */}

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex items-center gap-2 px-2 py-1 overflow-hidden">
              <span className="text-xs font-mono truncate flex-1 min-w-0 text-muted-foreground group-data-[collapsible=icon]:hidden">
                {walletAddress ? truncateAddress(walletAddress) : "No Wallet"}
              </span>
              {walletAddress && (
                <span className="group-data-[collapsible=icon]:hidden">
                  <CopyText text={walletAddress} />
                </span>
              )}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      onClick={() => handleDisconnect()}
                    >
                      <LogOut className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    <p>Disconnect wallet</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}