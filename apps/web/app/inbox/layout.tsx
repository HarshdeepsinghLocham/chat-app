import { InboxSubnav } from "@/components/inbox/inbox-subnav";

export default function InboxLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="mx-auto max-w-3xl space-y-6 p-6">
            <InboxSubnav />
            {children}
        </div>
    );
}
