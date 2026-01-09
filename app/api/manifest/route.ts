import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({
        name: "VastraaOS",
        short_name: "VastraaOS",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#ffffff",
        theme_color: "#ffffff",
        icons: [
            {
                src: "/vercel.svg",
                sizes: "192x192",
                type: "image/svg+xml"
            },
            {
                src: "/vercel.svg",
                sizes: "512x512",
                type: "image/svg+xml"
            }
        ]
    });
}
