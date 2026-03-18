import { createFileRoute } from "@tanstack/react-router";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import content from "../../../../PRODUCT.md?raw";

export const Route = createFileRoute("/product")({
  head: () => ({
    meta: [
      { title: "Product Bible — Blisko" },
      {
        tag: "link",
        attrs: {
          rel: "stylesheet",
          href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Source+Serif+4:ital,wght@0,400;0,600;1,400&display=swap",
        },
      },
    ],
  }),
  component: ProductPage,
});

function ProductPage() {
  return (
    <div className="min-h-dvh bg-bg text-ink antialiased" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div className="h-[3px] bg-gradient-to-r from-transparent via-accent/40 to-transparent" />

      <div className="max-w-[800px] mx-auto px-5 pt-10 pb-24 sm:px-8 sm:pt-14">
        <a
          href="/"
          className="group inline-flex items-center gap-2 text-[13px] text-muted no-underline mb-10 hover:text-ink transition-colors duration-200"
        >
          <span className="inline-block transition-transform duration-200 group-hover:-translate-x-[3px]">&larr;</span>
          <span>blisko.app</span>
        </a>

        <article className="prose prose-sm sm:prose-base max-w-none prose-headings:font-semibold prose-headings:tracking-tight prose-h1:text-[28px] sm:prose-h1:text-[34px] prose-h1:font-normal prose-h1:leading-[1.15] prose-h1:mb-4 prose-h2:text-[19px] prose-h2:mt-4 prose-h2:mb-3 prose-h3:text-[15px] prose-h3:uppercase prose-h3:tracking-wide prose-h3:text-muted prose-h3:mt-6 prose-h3:mb-2 prose-p:text-subtle prose-p:leading-[1.75] prose-li:text-subtle prose-a:text-accent prose-a:no-underline hover:prose-a:underline prose-strong:text-ink prose-blockquote:border-accent/40 prose-blockquote:text-subtle/80 prose-blockquote:not-italic prose-table:text-[13px] sm:prose-table:text-[14px] prose-th:text-left prose-th:font-semibold prose-th:text-ink prose-th:bg-ink/[0.03] prose-th:px-3 prose-th:py-2 prose-td:px-3 prose-td:py-2 prose-td:align-top prose-td:border-b prose-td:border-ink/[0.06] prose-hr:border-ink/[0.08] prose-hr:my-10">
          <Markdown
            remarkPlugins={[remarkGfm]}
            components={{
              h1: ({ children }) => <h1 style={{ fontFamily: "'Source Serif 4', Georgia, serif" }}>{children}</h1>,
            }}
          >
            {content}
          </Markdown>
        </article>
      </div>
    </div>
  );
}
