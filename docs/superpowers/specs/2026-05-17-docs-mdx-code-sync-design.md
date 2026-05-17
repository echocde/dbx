# DBX Docs MDX Code Sync Design

## Purpose

The static documentation site should describe DBX as it actually works in this repository. The current Fumadocs MDX pages already cover the main product areas, but several pages read as broad feature introductions and do not consistently reflect the concrete implementation details in the Vue app, Rust core, web backend, and MCP package.

This work updates both English and Simplified Chinese MDX pages together so the two locales stay aligned.

## Source Of Truth

Use repository code as the primary source of documentation facts:

- `src/types/database.ts` for database type names and shared frontend models.
- `src/components/connection/ConnectionDialog.vue` for connection profiles, default ports, file-based database handling, SSH/proxy availability, and user-visible connection fields.
- `src/lib/databaseCapabilitySets.ts` for per-feature database support boundaries.
- `src/lib/api.ts`, `src/lib/tauri.ts`, and `src/lib/http.ts` for desktop/web API parity.
- `crates/dbx-core/src/*.rs` for SQL execution, SQL file execution, table import, data transfer, database export, schema operations, plugin handling, AI, Redis, and MongoDB behavior.
- `src/components/*Dialog.vue` and `src/lib/*.ts` for user-facing workflows, previews, progress states, and safety decisions.
- `mcp/src/*.ts` for MCP tools, desktop vs web mode behavior, SQL safety defaults, and connection storage integration.

Do not invent support claims that are not visible in code. If a behavior is implemented as best-effort or has database-specific limits, document the limit plainly.

## Scope

Deeply revise these core pages in both locales:

- `getting-started`
- `databases`
- `query-editor`
- `data-grid`
- `schema-browser`
- `schema-diff`
- `data-transfer`
- `table-import`
- `sql-file`
- `database-export`
- `ai-assistant`
- `mcp`
- `plugins`

Lightly revise these pages for consistency, links, and missing boundaries:

- `what-is-dbx`
- `table-structure`
- `field-lineage`
- `config-export`
- `ssh-tunnel`

Leave `changelog` content source intact. Only adjust introductory wording, formatting, or links if needed.

## Content Design

Each revised page should answer four questions:

1. What task does this page help the user complete?
2. Which DBX implementation details matter for that task?
3. What are the supported database types, file types, modes, or safety boundaries?
4. Where should the user go next?

Use existing Fumadocs components only:

- `Callout` for warnings, implementation notes, and security boundaries.
- `Steps` for workflows.
- `Tabs` for platform or mode differences.
- `Cards` for related pages.
- `Accordion` only where it reduces scanning burden.

Keep the documentation practical. Prefer concrete workflows, tables, and limits over marketing copy.

## Key Facts To Reflect

Database support:

- DBX has explicit frontend and Rust `DatabaseType` variants for MySQL, PostgreSQL, SQLite, Redis, DuckDB, ClickHouse, SQL Server, MongoDB, Oracle, Elasticsearch, Doris, StarRocks, Redshift, Dameng, GaussDB, KingBase, HighGo, Vastbase, GoldenDB, Access, H2, Snowflake, Trino, Hive, DB2, Informix, Neo4j, Cassandra, BigQuery, Kylin, SunDB, TDengine, and JDBC.
- Connection profiles include MySQL-compatible and PostgreSQL-compatible options that map onto shared driver types.
- Some database types are native, some are compatibility profiles, some are Agent/JDBC-oriented, and feature availability varies by capability set.

Feature boundaries:

- Table import supports CSV, TSV, JSON, XLSX/XLSM/XLS files, previews the first rows, maps columns, imports in batches, and supports append or truncate mode.
- SQL file execution splits SQL safely across comments, quoted strings, dollar quotes, and SQL Server `GO` batches; it reports progress and can continue after errors when configured.
- Database export writes SQL files with table DDL, data inserts, and supported views/procedures/functions where available; export can be cancelled and supports selected-table filtering.
- Data transfer supports append, overwrite, and upsert-oriented modes in code, optional target table creation, batching, progress, and cancellation.
- AI assistant has Ask and Agent modes, schema context truncation behavior, SQL extraction, stream cancellation, and conservative SQL safety rules.
- MCP defaults to one statement per query and read-only SQL execution unless environment variables explicitly allow writes or dangerous SQL; desktop-only tools require DBX desktop to be running, while web mode uses `DBX_WEB_URL`.
- Redis and MongoDB have dedicated APIs and browser experiences rather than generic SQL table flows.

Safety:

- Generated or previewed SQL should be reviewed before execution.
- Destructive operations such as DROP, TRUNCATE, ALTER, DELETE, and broad UPDATE need explicit caution.
- Production-like connection names or hosts should be treated conservatively in AI/agent flows.
- Import, transfer, SQL file execution, database export, and schema diff can change or expose significant data, so docs should tell users where review/cancel/backup steps exist.

## Bilingual Consistency

For every content change:

- Update `.mdx` and `.cn.mdx` in the same pass.
- Keep heading structure, component structure, and cross-links equivalent.
- Use natural English and natural Simplified Chinese rather than literal translation.
- Preserve locale-specific links, for example `/en/docs/...` in English and `/cn/docs/...` in Chinese.

## Verification

After editing:

- Run a file-level scan for mismatched headings or missing counterpart pages.
- Run the docs build from `docs/` with the existing package manager.
- If the docs build cannot run because dependencies are missing or the environment blocks it, report the exact command and failure.

## Non-Goals

- Do not redesign the docs site UI.
- Do not add a new documentation framework or MDX plugin.
- Do not change application runtime behavior.
- Do not fabricate release notes for changelog entries.
