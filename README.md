# PowerWill API

Fastify backend API server for PowerWill with Clerk authentication.

## Features

- 🔐 **Clerk Authentication** - Secure user authentication
- 📊 **Goals Management** - CRUD operations for goals
- 🔒 **Row-Level Security** - Users can only access their own data
- ✅ **Zod Validation** - Type-safe request validation
- 📈 **PostHog Analytics** - User behavior tracking
- 📚 **Swagger Docs** - Auto-generated API documentation
- 🚀 **Rate Limiting** - Protection against abuse
- 🔍 **Pino Logging** - Structured logging with pino-pretty

## Development

```bash
npm run dev
```

Server will start at `http://localhost:3001`

## Environment Variables

Create a `.env` file in the `apps/api` directory (see `.env.example`):

```
PORT=3001
NODE_ENV=development
CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
CLERK_SECRET_KEY=your_clerk_secret_key
ALLOWED_ORIGINS=http://localhost:3000
POSTHOG_API_KEY=your_posthog_key (optional)
```

## Available Endpoints

### Health Check
- `GET /health` - Server health status
- `GET /` - API information

### Goals (Protected - Requires Clerk Authentication)
- `GET /v1/goals` - List all goals for authenticated user
- `GET /v1/goals/:id` - Get single goal
- `POST /v1/goals` - Create a new goal
- `PATCH /v1/goals/:id` - Update a goal
- `DELETE /v1/goals/:id` - Delete a goal

### Documentation
- `GET /docs` - Swagger UI documentation

## Authentication

All `/v1/*` endpoints require Clerk authentication. Include the Clerk session token in the Authorization header:

```
Authorization: Bearer <clerk_session_token>
```

The middleware will:
1. Validate the token with Clerk
2. Extract user information
3. Attach user data to the request object
4. Ensure users can only access their own resources

## Project Structure

```
src/
├── config/          # Configuration files
│   ├── config.ts    # App configuration
│   └── database.ts  # Prisma client export
├── controllers/     # Business logic
│   └── goalsController.ts
├── middleware/      # Custom middleware
│   ├── auth.ts      # Clerk authentication
│   ├── permissions.ts
│   └── validation.ts
├── plugins/         # Fastify plugins
│   ├── errorHandler.ts
│   ├── posthogClient.ts
│   └── routeGroups.ts
├── routes/          # API routes
│   └── goalsRoutes.ts
├── schemas/         # Zod validation schemas
│   ├── index.ts
│   └── goalsSchemas.ts
├── types/           # TypeScript types
│   └── auth.ts
├── utils/           # Utility functions
│   └── responseHelpers.ts
├── app.ts           # Fastify app initialization
└── server.ts        # Server entry point
```

## Building

```bash
npm run build
```

Output will be in the `dist/` directory.

## Production

```bash
npm start
```

## Database

The API uses the `@powerwill/database` package which exports a configured Prisma client. Database schema and migrations are managed at the package level.

## Notes

- User ownership is enforced at the controller level
- All Goals are scoped to the authenticated user's ID
- Validation errors return 400 with detailed error messages
- Authentication errors return 401
- Authorization errors return 403
- Not found errors return 404
