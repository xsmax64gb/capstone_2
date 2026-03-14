import swaggerJSDoc from "swagger-jsdoc";

const PORT = process.env.PORT || 5000;

const swaggerDefinition = {
  openapi: "3.0.3",
  info: {
    title: "ELapp Backend API",
    version: "1.0.0",
    description: "Swagger documentation for the ELapp backend",
  },
  servers: [
    {
      url: `http://localhost:${PORT}`,
      description: "Local development server",
    },
  ],
  tags: [
    {
      name: "Health",
      description: "System health endpoints",
    },
    {
      name: "Auth",
      description: "Authentication endpoints",
    },
    {
      name: "Exercises",
      description: "Exercise learning flow endpoints",
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
    schemas: {
      BasicResponse: {
        type: "object",
        properties: {
          success: {
            type: "boolean",
            example: true,
          },
          message: {
            type: "string",
            example: "Operation successful",
          },
        },
      },
      User: {
        type: "object",
        properties: {
          id: {
            type: "string",
            example: "67f4d8bc9345f6e8c17a3210",
          },
          fullName: {
            type: "string",
            example: "Nguyen Van A",
          },
          email: {
            type: "string",
            example: "user@example.com",
          },
          role: {
            type: "string",
            example: "user",
          },
          currentLevel: {
            type: "string",
            example: "A1",
          },
          exp: {
            type: "number",
            example: 0,
          },
          onboardingDone: {
            type: "boolean",
            example: false,
          },
          placementScore: {
            type: "number",
            example: 0,
          },
        },
      },
      AuthResponse: {
        type: "object",
        properties: {
          success: {
            type: "boolean",
            example: true,
          },
          message: {
            type: "string",
            example: "Login successfully",
          },
          data: {
            type: "object",
            properties: {
              token: {
                type: "string",
                example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
              },
              user: {
                $ref: "#/components/schemas/User",
              },
            },
          },
        },
      },
      RegisterBody: {
        type: "object",
        required: ["fullName", "email", "password"],
        properties: {
          fullName: {
            type: "string",
            example: "Nguyen Van A",
          },
          email: {
            type: "string",
            example: "user@example.com",
          },
          password: {
            type: "string",
            example: "123456",
          },
        },
      },
      LoginBody: {
        type: "object",
        required: ["email", "password"],
        properties: {
          email: {
            type: "string",
            example: "user@example.com",
          },
          password: {
            type: "string",
            example: "123456",
          },
        },
      },
      ChangePasswordBody: {
        type: "object",
        required: ["email", "oldPassword", "newPassword"],
        properties: {
          email: {
            type: "string",
            example: "user@example.com",
          },
          oldPassword: {
            type: "string",
            example: "123456",
          },
          newPassword: {
            type: "string",
            example: "654321",
          },
        },
      },
    },
  },
};

const options = {
  definition: swaggerDefinition,
  apis: ["./routes/*.js"],
};

const swaggerSpec = swaggerJSDoc(options);

export default swaggerSpec;
