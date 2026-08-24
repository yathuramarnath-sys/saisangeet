import { useEffect, useState } from "react";

export function PrototypePage({ prototypeFile }) {
  const [content, setContent] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadPrototype() {
      try {
        setError("");
        const response = await fetch(`/prototype/${prototypeFile}`);

        if (!response.ok) {
          throw new Error(`Failed to load ${prototypeFile}`);
        }

        const html = await response.text();
        const parser = new DOMParser();
        const documentNode = parser.parseFromString(html, "text/html");
        const mainContent = documentNode.querySelector(".main-content");

        if (!mainContent) {
          throw new Error(`Missing .main-content in ${prototypeFile}`);
        }

        const nav = mainContent.querySelector(".nav-list");
        if (nav) {
          nav.remove();
        }

        if (!cancelled) {
          setContent(mainContent.innerHTML);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message);
        }
      }
    }

    loadPrototype();

    return () => {
      cancelled = true;
    };
  }, [prototypeFile]);

  if (error) {
    return (
      <section className="panel" style={{ textAlign: "center", padding: "64px 32px" }}>
        <div style={{ fontSize: "2.5rem", marginBottom: "16px" }}>🚧</div>
        <h3 style={{ marginBottom: "8px" }}>Coming Soon</h3>
        <p style={{ color: "var(--color-text-secondary, #6B7280)" }}>
          This section is still being built. Check back soon.
        </p>
      </section>
    );
  }

  return <div dangerouslySetInnerHTML={{ __html: content }} />;
}
