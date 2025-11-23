import { NextRequest, NextResponse } from "next/server";
import { parseHTML } from "linkedom";

export const dynamic = "force-dynamic";

function getHostname() {
  if (process.env.NODE_ENV === "development") {
    return "localhost:3000";
  }
  // Use VERCEL_URL which is available in all Vercel environments
  if (process.env.VERCEL_URL) {
    return process.env.VERCEL_URL;
  }
  // Fallback for production
  if (process.env.VERCEL_ENV === "production") {
    return process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  }
  // Fallback for preview/branch deployments
  return process.env.VERCEL_BRANCH_URL || process.env.VERCEL_URL;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ rest: string[] }> },
) {
  try {
    const schema = process.env.NODE_ENV === "development" ? "http" : "https";
    const host = getHostname();
    if (!host) {
      // In development, try to use the request host header as fallback
      const hostHeader = request.headers.get("host");
      if (hostHeader && process.env.NODE_ENV === "development") {
        const resolvedParams = await params;
        const href = resolvedParams.rest.join("/");
        if (!href) {
          return NextResponse.json({ images: [] }, { status: 400 });
        }
        const url = `${schema}://${hostHeader}/${href}`;
        try {
          const response = await fetch(url, {
            headers: {
              "User-Agent": "Next.js Prefetch",
            },
          });
          if (!response.ok) {
            return NextResponse.json({ images: [] }, { status: 200 });
          }
          const body = await response.text();
          const { document } = parseHTML(body);
          const images = Array.from(document.querySelectorAll("main img"))
            .map((img) => ({
              srcset: img.getAttribute("srcset") || img.getAttribute("srcSet"), // Linkedom is case-sensitive
              sizes: img.getAttribute("sizes"),
              src: img.getAttribute("src"),
              alt: img.getAttribute("alt"),
              loading: img.getAttribute("loading"),
            }))
            .filter((img) => img.src);
          return NextResponse.json(
            { images },
            {
              headers: {
                "Cache-Control": "public, max-age=3600",
              },
            },
          );
        } catch (error) {
          console.error("Failed to fetch page for prefetch:", error);
          return NextResponse.json({ images: [] }, { status: 200 });
        }
      }
      return NextResponse.json({ images: [] }, { status: 500 });
    }
    const resolvedParams = await params;
    const href = resolvedParams.rest.join("/");
    if (!href) {
      return NextResponse.json({ images: [] }, { status: 400 });
    }
    const url = `${schema}://${host}/${href}`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Next.js Prefetch",
      },
    });
    if (!response.ok) {
      return NextResponse.json({ images: [] }, { status: 200 });
    }
    const body = await response.text();
    const { document } = parseHTML(body);
    const images = Array.from(document.querySelectorAll("main img"))
      .map((img) => ({
        srcset: img.getAttribute("srcset") || img.getAttribute("srcSet"), // Linkedom is case-sensitive
        sizes: img.getAttribute("sizes"),
        src: img.getAttribute("src"),
        alt: img.getAttribute("alt"),
        loading: img.getAttribute("loading"),
      }))
      .filter((img) => img.src);
    return NextResponse.json(
      { images },
      {
        headers: {
          "Cache-Control": "public, max-age=3600",
        },
      },
    );
  } catch (error) {
    console.error("Error in prefetch-images route:", error);
    return NextResponse.json({ images: [] }, { status: 200 });
  }
}
