"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  LogOut,
  FileSearchCorner,
  ListFilter,
} from "lucide-react";
import { useDisconnect, useAccount } from "wagmi";
import Image from "next/image";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Sidebar,
  SidebarContent,
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

export type AuditorAppView = "rules" | "findings";

const navItems: {
  id: AuditorAppView;
  title: string;
  icon: React.ElementType;
}[] = [
  { id: "rules", title: "Test Rules", icon: ListFilter },
  { id: "findings", title: "Findings", icon: FileSearchCorner },
];

type AuditorSidebarProps = {
  walletAddress?: string;
  activeView: AuditorAppView;
  onNavigate: (view: AuditorAppView) => void;
  isLocked?: boolean;
  onBeforeDisconnect?: () => void;
} & React.ComponentProps<typeof Sidebar>;

export function AuditorSidebar({
  walletAddress,
  activeView,
  onNavigate,
  isLocked = false,
  onBeforeDisconnect,
  ...props
}: AuditorSidebarProps) {
  const router = useRouter();
  const { address } = useAccount();
  const actualWalletAddress = walletAddress || address;

  const [logoutOpen, setLogoutOpen] = React.useState(false);

  const { disconnect } = useDisconnect({
    mutation: {
      onSuccess: () => {
        // Handle disconnect success
      },
    },
  });

  const handleDisconnect = () => {
    onBeforeDisconnect?.();
    disconnect();
    setLogoutOpen(false);
  };

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              className="md:h-12 md:p-0 hover:bg-transparent active:bg-transparent"
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
              <span className="font-bold text-lg truncate">
                Complyr Auditor
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

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
                          <p className="text-xs">Connect to unlock</p>
                        </TooltipContent>
                       )}
                    </Tooltip>
                  </TooltipProvider>
                </SidebarMenuItem>
              ))}

              {actualWalletAddress && (
                <SidebarMenuItem className="mt-4">
                  <AlertDialog open={logoutOpen} onOpenChange={setLogoutOpen}>
                    <AlertDialogTrigger 
                      render={
                        <SidebarMenuButton className="gap-3 py-5 rounded transition-all w-full text-destructive hover:text-destructive hover:bg-destructive/10" />
                      }
                    >
                      <LogOut className="shrink-0" />
                      <span>Log Out</span>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Are you sure you want to log out?</AlertDialogTitle>
                        <AlertDialogDescription>
                          You will need to reconnect your wallet to access the auditor portal.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDisconnect} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                          Log out
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
