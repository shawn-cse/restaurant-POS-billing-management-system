import type { Metadata } from "next";
import Link from "next/link";
import { DocPage, DocSection } from "@/components/marketing/doc-page";

export const metadata: Metadata = {
  title: "Documentation — Urban Bite",
  description: "API, accessibility, and setup guidance for Urban Bite.",
};

const docs = [
  {
    href: "/docs/api",
    title: "API & MCP",
    description: "Connect an AI client via MCP, or use Urban Bite as a backend for your own website.",
  },
  {
    href: "/docs/accessibility",
    title: "Accessibility",
    description: "How Urban Bite is built to work with keyboards, screen readers, and reduced motion.",
  },
];

export default function DocsIndexPage() {
  return (
    <DocPage title="Documentation" updated="30 September 2026">
      <DocSection heading="Guides">
        <div className="flex flex-col divide-y divide-border/60 rounded-xl border border-border/60">
          {docs.map((doc) => (
            <Link
              key={doc.href}
              href={doc.href}
              className="flex flex-col gap-1 p-4 transition-colors hover:bg-secondary"
            >
              <span className="text-sm font-medium text-foreground">{doc.title}</span>
              <span className="text-sm text-muted-foreground">{doc.description}</span>
            </Link>
          ))}
        </div>
      </DocSection>

      <DocSection heading="Installation">
        <p>For setup and deployment instructions, see <code>README.md</code> in the supplied Urban Bite archive.</p>
      </DocSection>
    </DocPage>
  );
}
