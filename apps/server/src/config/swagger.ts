import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";
import { Express } from "express";

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.1.0",
    info: {
      title: "Petakeu API",
      version: "0.1.0",
      description: "REST API for Petakeu - Peta Interaktif Pemasukan Daerah",
      contact: {
        name: "Petakeu Team",
        email: "dev@petakeu.go.id",
      },
      license: {
        name: "Internal",
        url: "https://petakeu.go.id/license",
      },
    },
    servers: [
      {
        url: "http://localhost:4000/api",
        description: "Development server",
      },
      {
        url: "https://api.petakeu.go.id/api",
        description: "Production server",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
      responses: {
        BadRequest: {
          description: "Bad request - validation error",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Error" },
            },
          },
        },
        Unauthorized: {
          description: "Unauthorized - invalid or missing authentication",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Error" },
            },
          },
        },
        NotFound: {
          description: "Resource not found",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Error" },
            },
          },
        },
        InternalServerError: {
          description: "Internal server error",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Error" },
            },
          },
        },
      },
      schemas: {
        // Common schemas
        Error: {
          type: "object",
          properties: {
            error: { type: "string" },
            details: { type: "object" },
          },
        },
        PaginatedResponse: {
          type: "object",
          properties: {
            data: { type: "array", items: {} },
            meta: {
              type: "object",
              properties: {
                page: { type: "integer" },
                pageSize: { type: "integer" },
                total: { type: "integer" },
                totalPages: { type: "integer" },
              },
            },
          },
        },
        // Region schemas
        Region: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            code: { type: "string" },
            name: { type: "string" },
            level: { type: "string", enum: ["province", "regency", "district", "village"] },
            parentId: { type: "string", format: "uuid", nullable: true },
          },
        },
        RegionSummary: {
          type: "object",
          properties: {
            region: { $ref: "#/components/schemas/Region" },
            totalAmount: { type: "number" },
            cut15Amount: { type: "number" },
            netAmount: { type: "number" },
            trend: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  period: { type: "string", pattern: "^\\d{4}-\\d{2}$" },
                  amount: { type: "number" },
                },
              },
            },
            monthlyBreakdown: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  period: { type: "string", pattern: "^\\d{4}-\\d{2}$" },
                  amount: { type: "number" },
                  cut15Amount: { type: "number" },
                  netAmount: { type: "number" },
                },
              },
            },
            lastUpdated: { type: "string", format: "date-time" },
            reportUrl: { type: "string", format: "uri" },
          },
        },
        // Geo/Choropleth schemas
        QuantileBin: {
          type: "object",
          properties: {
            index: { type: "integer" },
            min: { type: "number" },
            max: { type: "number" },
            label: { type: "string" },
          },
        },
        LegendRange: {
          type: "object",
          properties: {
            min: { type: "number" },
            max: { type: "number" },
            label: { type: "string" },
          },
        },
        LegendDefinition: {
          type: "object",
          properties: {
            method: { type: "string", enum: ["quantile"] },
            bins: { type: "array", items: { type: "number" } },
            labels: { type: "array", items: { type: "string" } },
            ranges: { type: "array", items: { $ref: "#/components/schemas/LegendRange" } },
          },
        },
        ChoroplethFeatureProperties: {
          type: "object",
          properties: {
            regionId: { type: "string" },
            name: { type: "string" },
            centroid: { type: "array", items: { type: "number" }, minItems: 2, maxItems: 2 },
            classIndex: { type: "integer" },
            classLabel: { type: "string" },
            value: { type: "number" },
            normalizedValue: { type: "number" },
            sparkline: { type: "array", items: { type: "number" } },
          },
        },
        ChoroplethFeature: {
          type: "object",
          properties: {
            type: { type: "string", enum: ["Feature"] },
            id: { type: "string" },
            geometry: { $ref: "#/components/schemas/GeoJSONGeometry" },
            properties: { $ref: "#/components/schemas/ChoroplethFeatureProperties" },
          },
        },
        GeoJSONGeometry: {
          oneOf: [
            { $ref: "#/components/schemas/Polygon" },
            { $ref: "#/components/schemas/MultiPolygon" },
          ],
        },
        Polygon: {
          type: "object",
          properties: {
            type: { type: "string", enum: ["Polygon"] },
            coordinates: { type: "array", items: { type: "array", items: { type: "array", items: { type: "number" } } } },
          },
        },
        MultiPolygon: {
          type: "object",
          properties: {
            type: { type: "string", enum: ["MultiPolygon"] },
            coordinates: { type: "array", items: { type: "array", items: { type: "array", items: { type: "array", items: { type: "number" } } } } },
          },
        },
        ChoroplethResponse: {
          type: "object",
          properties: {
            type: { type: "string", enum: ["FeatureCollection"] },
            features: { type: "array", items: { $ref: "#/components/schemas/ChoroplethFeature" } },
            metadata: {
              type: "object",
              properties: {
                period: { type: "string", pattern: "^\\d{4}-\\d{2}$" },
                legend: { $ref: "#/components/schemas/LegendDefinition" },
                public: { type: "boolean" },
                warnings: { type: "array", items: { type: "string" } },
                scenario: { type: "string" },
              },
            },
          },
        },
        // Upload schemas
        UploadErrorDetail: {
          type: "object",
          properties: {
            row: { type: "integer" },
            column: { type: "string" },
            message: { type: "string" },
          },
        },
        UploadRecord: {
          type: "object",
          properties: {
            uploadId: { type: "string", format: "uuid" },
            filename: { type: "string" },
            status: { type: "string", enum: ["queued", "processing", "parsed", "failed"] },
            errorCount: { type: "integer" },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
            fileUrl: { type: "string", format: "uri", nullable: true },
            errors: { type: "array", items: { $ref: "#/components/schemas/UploadErrorDetail" } },
          },
        },
        UploadSummary: {
          type: "object",
          properties: {
            totalRows: { type: "integer" },
            validRows: { type: "integer" },
            totalAmount: { type: "number" },
            periodRange: {
              type: "object",
              properties: {
                from: { type: "string", pattern: "^\\d{4}-\\d{2}$" },
                to: { type: "string", pattern: "^\\d{4}-\\d{2}$" },
              },
            },
          },
        },
        UploadResponse: {
          type: "object",
          properties: {
            uploadId: { type: "string", format: "uuid" },
            status: { type: "string" },
            hash: { type: "string" },
          },
        },
        // Report schemas
        ReportRequest: {
          type: "object",
          required: ["regionId", "periodFrom", "periodTo", "format"],
          properties: {
            regionId: { type: "string", format: "uuid" },
            periodFrom: { type: "string", pattern: "^\\d{4}-\\d{2}$" },
            periodTo: { type: "string", pattern: "^\\d{4}-\\d{2}$" },
            format: { type: "string", enum: ["pdf", "excel"] },
          },
        },
        ReportSummaryRegion: {
          type: "object",
          properties: {
            regionId: { type: "string" },
            regionName: { type: "string" },
            total: { type: "number" },
            changePercentage: { type: "number" },
          },
        },
        ReportTrendItem: {
          type: "object",
          properties: {
            regionId: { type: "string" },
            regionName: { type: "string" },
            changePercentage: { type: "number" },
          },
        },
        ReportSummary: {
          type: "object",
          properties: {
            totalsByRegion: { type: "array", items: { $ref: "#/components/schemas/ReportSummaryRegion" } },
            topGainers: { type: "array", items: { $ref: "#/components/schemas/ReportTrendItem" } },
            topDecliners: { type: "array", items: { $ref: "#/components/schemas/ReportTrendItem" } },
            lastTwelveMonths: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  period: { type: "string", pattern: "^\\d{4}-\\d{2}$" },
                  total: { type: "number" },
                },
              },
            },
          },
        },
        ReportJob: {
          type: "object",
          properties: {
            jobId: { type: "string", format: "uuid" },
            period: { type: "string", pattern: "^\\d{4}-\\d{2}$" },
            regionIds: { type: "array", items: { type: "string", format: "uuid" } },
            format: { type: "string", enum: ["pdf", "excel"] },
            status: { type: "string", enum: ["queued", "processing", "completed", "failed"] },
            downloadUrl: { type: "string", format: "uri", nullable: true },
            requestedAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
            expiresAt: { type: "string", format: "date-time", nullable: true },
            expired: { type: "boolean" },
            summary: { $ref: "#/components/schemas/ReportSummary" },
          },
        },
        // Fiscal schemas
        RankingItem: {
          type: "object",
          properties: {
            regionId: { type: "string" },
            regionName: { type: "string" },
            target: { type: "number" },
            realization: { type: "number" },
            percentage: { type: "number" },
            yoy: { type: "number" },
            rank: { type: "integer" },
          },
        },
        SurplusDeficitItem: {
          type: "object",
          properties: {
            regionId: { type: "string" },
            regionName: { type: "string" },
            surplus: { type: "number" },
            deficit: { type: "number" },
            ytd: { type: "number" },
          },
        },
        AlertItem: {
          type: "object",
          properties: {
            id: { type: "string" },
            regionId: { type: "string" },
            regionName: { type: "string" },
            date: { type: "string", format: "date" },
            type: { type: "string" },
            riskLevel: { type: "string", enum: ["red", "orange", "green"] },
            message: { type: "string" },
            status: { type: "string", enum: ["active", "resolved"] },
          },
        },
        // RankFin schemas
        LeagueItem: {
          type: "object",
          properties: {
            regionId: { type: "string" },
            regionName: { type: "string" },
            score: { type: "number" },
            tier: { type: "string", enum: ["gold", "silver", "bronze"] },
            rank: { type: "integer" },
            badges: { type: "array", items: { type: "string" } },
          },
        },
        BadgeItem: {
          type: "object",
          properties: {
            id: { type: "string" },
            code: { type: "string" },
            name: { type: "string" },
            description: { type: "string" },
          },
        },
        // DefisitWatch schemas
        WatchlistItem: {
          type: "object",
          properties: {
            regionId: { type: "string" },
            regionName: { type: "string" },
            irf: { type: "number" },
            category: { type: "string", enum: ["red", "orange", "green"] },
            topReason: { type: "string" },
          },
        },
        RegionDetail: {
          type: "object",
          properties: {
            regionId: { type: "string" },
            regionName: { type: "string" },
            irf: { type: "number" },
            category: { type: "string", enum: ["red", "orange", "green"] },
            reasons: { type: "array", items: { type: "string" } },
            projection: {
              type: "object",
              properties: {
                target: { type: "array", items: { type: "number" } },
                realization: { type: "array", items: { type: "number" } },
                kas: { type: "array", items: { type: "number" } },
              },
            },
          },
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
    tags: [
      { name: "Health", description: "Health check endpoints" },
      { name: "Regions", description: "Administrative regions management" },
      { name: "Geography", description: "Choropleth and map data" },
      { name: "Uploads", description: "File upload and processing" },
      { name: "Reports", description: "Report generation and management" },
      { name: "Fiscal", description: "Fiscal dashboard (FiscalView)" },
      { name: "RankFin", description: "Gamification (RankFin)" },
      { name: "DefisitWatch", description: "Early warning system (DefisitWatch)" },
    ],
  },
  apis: ["./src/routes/v1/*.ts", "./src/controllers/*.ts"],
};

const swaggerSpec = swaggerJsdoc(options);

export function setupSwagger(app: Express) {
  // Serve Swagger UI
  app.use(
    "/api-docs",
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
      explorer: true,
      customCss: ".swagger-ui .topbar { display: none }",
      customSiteTitle: "Petakeu API Documentation",
    })
  );

  // Serve raw OpenAPI spec
  app.get("/api-docs.json", (_req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.send(swaggerSpec);
  });

  app.get("/api-docs.yaml", (_req, res) => {
    res.setHeader("Content-Type", "application/yaml");
    res.send(swaggerSpec);
  });
}