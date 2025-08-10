# GradeJS Backend on Deno

This is a Deno-based reimplementation of the GradeJS backend. It uses Oak for the web server and supports multiple database backends (SQLite and PostgreSQL) which can be selected via an environment variable.

## Prerequisites

- [Deno](httpshttps://deno.land/manual/getting_started/installation) 1.33 or higher.
-   (Optional) A running [PostgreSQL](https://www.postgresql.org/download/) database instance if you wish to use it.


## Setup and Running the Application

1.  **Configure Environment Variables**:
    You can set environment variables in two ways:

    **Method A: Create a `.env` file (Recommended for local development)**
    Create a file named `.env` in the project root. The `deno task` commands are pre-configured to load this file using the `--env` flag.

    *To use SQLite (Default):*
    You can leave the `.env` file empty or not create it at all. The application will default to SQLite and create a `gradejs.db` file.

    *To use PostgreSQL:*
    Your `.env` file should contain:
    ```env
    DB_TYPE=postgres
    DATABASE_URL=postgres://gradejs:gradejs@localhost:5432/gradejs-public
    ```

    **Method B: Export variables in your shell**
    Alternatively, you can export the variables directly in your terminal before running the commands.
    ```bash
    export DB_TYPE=postgres
    export DATABASE_URL="postgres://gradejs:gradejs@localhost:5432/gradejs-public"
    deno task run-api
    ```

2.  **Run Database Migrations**:
    This command will automatically detect your chosen `DB_TYPE` and run the correct migration file.

    ```bash
    deno task db-migrate
    ```

3.  **Start the API Server:**
    This server handles all incoming web requests.

    ```bash
    deno task run-api
    ```
    The API will be available at `http://localhost:8000`.

4.  **Start the Worker:**
    This process polls the database for new tasks and executes background jobs.

    ```bash
    deno task run-worker
    ```

## API Usage Example

The API endpoints remain the same regardless of the chosen database.

**1. Request a website scan:**

```bash
curl -X POST -H "Content-Type: application/json" -d '{"url": "https://deno.land"}' http://localhost:8000/scans
```

This will return a pending scan object and queue the analysis in the background.

**2. Check the scan result:**
Wait a few seconds for the mock scanner to "complete" the job, then fetch the scan by its URL.

```bash
curl http://localhost:8000/scans/by-url?url=https://deno.land/
```

**3. Search for packages:**

```bash
curl http://localhost:8000/search?q=oak
```

