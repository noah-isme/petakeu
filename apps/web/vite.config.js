import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
function readBody(req) {
    return new Promise((resolve) => {
        let body = "";
        req.on("data", (chunk) => {
            body += chunk;
        });
        req.on("end", () => {
            resolve(body);
        });
        req.on("error", () => {
            resolve("");
        });
    });
}
function devMockServerPlugin() {
    return {
        name: "dev-mock-server",
        configureServer(server) {
            server.middlewares.use(async (req, res, next) => {
                const url = req.url?.split("?")[0] || "";
                // Healthz probe endpoints: only return 200 for exact /healthz, /api/healthz, /api/v1/healthz
                if (url === "/healthz" || url === "/api/healthz" || url === "/api/v1/healthz") {
                    res.setHeader("Content-Type", "application/json");
                    res.statusCode = 200;
                    res.end(JSON.stringify({
                        status: "healthy",
                        timestamp: new Date().toISOString(),
                        uptime: process.uptime(),
                        checks: {
                            database: {
                                status: "healthy",
                                latencyMs: 4,
                                details: {
                                    query: "SELECT 1 AS alive, PostGIS_Version() AS postgis_version",
                                    postgisVersion: "3.4.0"
                                }
                            },
                            redis: {
                                status: "healthy",
                                latencyMs: 2,
                                details: {
                                    command: "PING"
                                }
                            },
                            storage: {
                                status: "healthy",
                                latencyMs: 3,
                                details: {
                                    provider: "MinIO/S3",
                                    buckets: ["uploads", "reports"]
                                }
                            },
                            queue: {
                                status: "healthy",
                                latencyMs: 3,
                                details: {
                                    uploadQueue: { active: 0, waiting: 0, completed: 10, failed: 0 },
                                    reportQueue: { active: 0, waiting: 0, completed: 5, failed: 0 }
                                }
                            }
                        }
                    }));
                    return;
                }
                // Direct Node requests from playwright request fixture to /api/uploads
                if (req.method === "POST" && (url === "/api/uploads" || url === "/api/v1/uploads")) {
                    res.setHeader("Content-Type", "application/json");
                    res.statusCode = 202;
                    res.end(JSON.stringify({ upload_id: "mock-upload-id-node", uploadId: "mock-upload-id-node", status: "queued" }));
                    return;
                }
                // Direct Node requests from playwright request fixture to /api/reports/export or /api/reports
                if (req.method === "POST" && (url === "/api/reports/export" || url === "/api/v1/reports/export" || url === "/api/reports" || url === "/api/v1/reports")) {
                    const rawBody = await readBody(req);
                    let parsed = {};
                    try {
                        parsed = rawBody ? JSON.parse(rawBody) : {};
                    }
                    catch {
                        parsed = {};
                    }
                    const format = String(parsed.format ?? parsed.type ?? "pdf").toLowerCase();
                    const period = String(parsed.period ?? parsed.periodFrom ?? parsed.periodTo ?? "2025-08");
                    const regionIds = Array.isArray(parsed.regionIds)
                        ? parsed.regionIds
                        : parsed.regionId
                            ? [parsed.regionId]
                            : ["3301", "3302"];
                    const jobId = "mock-report-job-node";
                    const ext = format === "excel" || format === "xlsx" ? "xlsx" : "pdf";
                    const downloadUrl = `https://storage.petakeu.local/reports/${jobId}.${ext}`;
                    res.setHeader("Content-Type", "application/json");
                    res.statusCode = 202;
                    res.end(JSON.stringify({
                        data: {
                            jobId,
                            id: jobId,
                            period,
                            regionIds,
                            format,
                            type: format,
                            status: "queued",
                            downloadUrl,
                            summary: {
                                totalRegions: regionIds.length,
                                totalsByRegion: regionIds.map((r) => ({
                                    regionId: r,
                                    regionName: `Wilayah ${r}`,
                                    totalGross: 1500000000,
                                    totalNet: 1275000000
                                })),
                                totalNeto: regionIds.length * 1275000000,
                                changePercentage: 5.2,
                                topGainers: [],
                                topDecliners: []
                            }
                        },
                        job_id: jobId,
                        jobId,
                        status: "queued"
                    }));
                    return;
                }
                // Direct Node requests to GET /api/reports/:id or /api/v1/reports/:id
                const reportMatch = url.match(/^\/api(?:\/v1)?\/reports\/([^\/?#]+)$/);
                if (req.method === "GET" && reportMatch) {
                    const reportId = reportMatch[1];
                    if (reportId === "00000000-0000-0000-0000-000000000000") {
                        res.setHeader("Content-Type", "application/json");
                        res.statusCode = 404;
                        res.end(JSON.stringify({ error: "Report not found" }));
                        return;
                    }
                    if (reportId && reportId !== "export") {
                        res.setHeader("Content-Type", "application/json");
                        res.statusCode = 200;
                        res.end(JSON.stringify({
                            data: {
                                jobId: reportId,
                                id: reportId,
                                status: "completed",
                                progress: 100,
                                format: "pdf",
                                downloadUrl: `https://storage.petakeu.local/reports/${reportId}.pdf`,
                                summary: {
                                    totalRegions: 2,
                                    totalsByRegion: [
                                        { regionId: "3301", regionName: "Cilacap", totalGross: 1500000000, totalNet: 1275000000 },
                                        { regionId: "3302", regionName: "Banyumas", totalGross: 1500000000, totalNet: 1275000000 }
                                    ],
                                    totalNeto: 2550000000,
                                    changePercentage: 5.2,
                                    topGainers: [],
                                    topDecliners: []
                                }
                            }
                        }));
                        return;
                    }
                }
                // For unhandled /api/*, /healthz*, or /health/* requests, return HTTP 404
                if (url.startsWith("/api/") || url.startsWith("/healthz") || url.startsWith("/health/")) {
                    res.setHeader("Content-Type", "application/json");
                    res.statusCode = 404;
                    res.end(JSON.stringify({ error: "Not found" }));
                    return;
                }
                next();
            });
        }
    };
}
export default defineConfig({
    server: {
        port: 5175,
        // Proxy disabled - using MSW for development
        // proxy: {
        //   "/api": "http://localhost:4000"
        // }
    },
    plugins: [react(), devMockServerPlugin()],
    test: {
        globals: true,
        environment: "jsdom",
        setupFiles: "./src/test/setup.ts",
        exclude: ["node_modules", "e2e"]
    }
});
