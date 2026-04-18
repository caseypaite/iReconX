suppressPackageStartupMessages({
  library(DBI)
  library(dplyr)
  library(jsonlite)
  library(tibble)
})

PLUGIN_PROTOCOL_VERSION <- "ireconx.plugin.v1"

`%||%` <- function(x, y) {
  if (is.null(x)) y else x
}

normalize_cell <- function(value) {
  if (length(value) == 0 || is.null(value) || (length(value) == 1 && is.na(value))) {
    return(NULL)
  }

  if (inherits(value, "POSIXt") || inherits(value, "Date")) {
    return(as.character(value))
  }

  if (is.logical(value)) {
    return(isTRUE(value))
  }

  if (is.numeric(value)) {
    return(as.numeric(value))
  }

  as.character(value)
}

infer_column_kind <- function(values) {
  non_null <- Filter(function(value) !is.null(value), lapply(values, normalize_cell))

  if (length(non_null) == 0) {
    return("empty")
  }

  if (all(vapply(non_null, is.numeric, logical(1)))) {
    return("number")
  }

  if (all(vapply(non_null, is.logical, logical(1)))) {
    return("boolean")
  }

  if (all(vapply(non_null, is.character, logical(1)))) {
    return("string")
  }

  "mixed"
}

dataset_to_tibble <- function(dataset) {
  if (is.null(dataset) || is.null(dataset$rows) || length(dataset$rows) == 0) {
    return(tibble())
  }

  column_defs <- dataset$columns %||% list()
  column_names <- vapply(column_defs, function(column) column$key %||% "", character(1))
  column_kinds <- stats::setNames(
    vapply(column_defs, function(column) column$kind %||% "mixed", character(1)),
    column_names
  )

  if (length(column_names) == 0) {
    column_names <- unique(unlist(lapply(dataset$rows, names), use.names = FALSE))
    column_kinds <- stats::setNames(rep("mixed", length(column_names)), column_names)
  }

  coerce_value <- function(value, kind) {
    if (is.null(value) || length(value) == 0 || (length(value) == 1 && is.na(value))) {
      return(NA)
    }

    if (kind %in% c("string", "date", "mixed", "empty")) {
      return(as.character(value))
    }

    if (kind == "number") {
      numeric_value <- suppressWarnings(as.numeric(value))
      return(if (length(numeric_value) == 0 || is.na(numeric_value)) NA_real_ else numeric_value)
    }

    if (kind == "boolean") {
      if (is.logical(value)) {
        return(isTRUE(value))
      }

      normalized <- tolower(as.character(value))
      if (normalized %in% c("true", "1", "yes")) return(TRUE)
      if (normalized %in% c("false", "0", "no")) return(FALSE)
      return(NA)
    }

    as.character(value)
  }

  normalized_rows <- lapply(dataset$rows, function(row) {
    record <- list()

    for (column_name in column_names) {
      record[[column_name]] <- coerce_value(row[[column_name]], column_kinds[[column_name]] %||% "mixed")
    }

    tibble::as_tibble(record)
  })

  bind_rows(normalized_rows)
}

studio_dataset_from_df <- function(df, label) {
  normalized_df <- as.data.frame(df, stringsAsFactors = FALSE)
  rows <- vector("list", nrow(normalized_df))

  if (nrow(normalized_df) > 0) {
    for (index in seq_len(nrow(normalized_df))) {
      record <- list()

      for (column_name in names(normalized_df)) {
        record[[column_name]] <- normalize_cell(normalized_df[[column_name]][[index]])
      }

      rows[[index]] <- record
    }
  }

  columns <- lapply(names(normalized_df), function(column_name) {
    list(
      key = column_name,
      label = column_name,
      kind = infer_column_kind(normalized_df[[column_name]])
    )
  })

  list(
    label = label,
    sourceKind = "generated",
    rowCount = nrow(normalized_df),
    columns = columns,
    rows = rows
  )
}

is_studio_dataset <- function(value) {
  is.list(value) &&
    !is.null(value$label) &&
    !is.null(value$columns) &&
    !is.null(value$rows) &&
    !is.null(value$rowCount)
}

serialize_viewer_value <- function(key, label, value) {
  if (is.null(value) || length(value) == 0 || (length(value) == 1 && is.na(value))) {
    return(list(key = key, label = label, kind = "null"))
  }

  if (inherits(value, c("data.frame", "tbl_df", "tbl"))) {
    return(list(
      key = key,
      label = label,
      kind = "table",
      dataset = studio_dataset_from_df(as.data.frame(value, stringsAsFactors = FALSE), label)
    ))
  }

  if (is_studio_dataset(value)) {
    return(list(
      key = key,
      label = label,
      kind = "table",
      dataset = value
    ))
  }

  if (is.list(value)) {
    item_names <- names(value)
    items <- lapply(seq_along(value), function(index) {
      item_label <- if (!is.null(item_names) && nzchar(item_names[[index]] %||% "")) item_names[[index]] else sprintf("[%s]", index)
      serialize_viewer_value(item_label, item_label, value[[index]])
    })

    return(list(
      key = key,
      label = label,
      kind = "list",
      items = unname(items)
    ))
  }

  if ((is.atomic(value) || inherits(value, "Date") || inherits(value, "POSIXt")) && length(value) > 1) {
    items <- lapply(seq_along(value), function(index) {
      item_label <- sprintf("[%s]", index)
      serialize_viewer_value(item_label, item_label, value[[index]])
    })

    return(list(
      key = key,
      label = label,
      kind = "list",
      items = unname(items)
    ))
  }

  list(
    key = key,
    label = label,
    kind = "scalar",
    value = normalize_cell(value)
  )
}

build_viewer_payload <- function(response_dataset, result_outputs, result_value, node_label) {
  objects <- list()

  add_object <- function(key, label, value) {
    objects[[length(objects) + 1]] <<- serialize_viewer_value(key, label, value)
  }

  if (!is.null(response_dataset)) {
    add_object("dataset", sprintf("%s dataset", node_label), response_dataset)
  }

  output_names <- names(result_outputs) %||% character()
  if (length(result_outputs) > 0) {
    for (index in seq_along(result_outputs)) {
      output_name <- if (length(output_names) >= index && nzchar(output_names[[index]] %||% "")) output_names[[index]] else sprintf("output_%s", index)

      if (output_name == "__ireconxViewer") {
        next
      }

      add_object(sprintf("output:%s", output_name), output_name, result_outputs[[index]])
    }
  }

  if (!is.null(result_value)) {
    if (is.list(result_value)) {
      residual_names <- names(result_value) %||% character()
      reserved_fields <- c("status", "summary", "dataset", "outputs", "logs")

      for (index in seq_along(result_value)) {
        item_name <- if (length(residual_names) >= index && nzchar(residual_names[[index]] %||% "")) residual_names[[index]] else sprintf("result_%s", index)

        if (item_name %in% reserved_fields) {
          next
        }

        add_object(sprintf("result:%s", item_name), item_name, result_value[[index]])
      }
    } else if (length(objects) == 0) {
      add_object("result", "Result", result_value)
    }
  }

  if (length(objects) == 0) {
    return(NULL)
  }

  list(objects = unname(objects))
}

connect_db <- function(connection) {
  if (connection$type == "POSTGRESQL") {
    return(DBI::dbConnect(
      RPostgres::Postgres(),
      host = connection$host,
      port = connection$port,
      dbname = connection$database %||% connection$schema,
      user = connection$username,
      password = connection$password
    ))
  }

  if (connection$type == "MYSQL") {
    return(DBI::dbConnect(
      RMariaDB::MariaDB(),
      host = connection$host,
      port = connection$port,
      dbname = connection$database %||% connection$schema,
      user = connection$username,
      password = connection$password
    ))
  }

  stop("Unsupported tidyverse connection type.")
}

build_error_response <- function(message) {
  list(error = as.character(message))
}

resolve_source_tbl <- function(connection, db, add_log = NULL) {
  if (is.null(connection) || is.null(db)) {
    return(NULL)
  }

  table_name <- connection$tableName %||% NULL
  if (is.null(table_name) || !nzchar(table_name)) {
    return(NULL)
  }

  schema_name <- connection$tableSchema %||% connection$schema %||% NULL
  attempts <- list()

  if (!is.null(schema_name) && nzchar(schema_name)) {
    attempts[[length(attempts) + 1]] <- list(
      label = sprintf("%s.%s via DBI::Id", schema_name, table_name),
      build = function() dplyr::tbl(db, DBI::Id(schema = schema_name, table = table_name))
    )
    attempts[[length(attempts) + 1]] <- list(
      label = sprintf("%s.%s via dbplyr::in_schema", schema_name, table_name),
      build = function() dplyr::tbl(db, dbplyr::in_schema(schema_name, table_name))
    )
  }

  attempts[[length(attempts) + 1]] <- list(
    label = sprintf("%s via bare table name", table_name),
    build = function() dplyr::tbl(db, table_name)
  )

  last_error <- NULL

  for (attempt in attempts) {
    candidate <- tryCatch(
      {
        tbl <- attempt$build()
        colnames(tbl)
        tbl
      },
      error = function(error) {
        last_error <<- error$message
        NULL
      }
    )

    if (!is.null(candidate)) {
      if (!is.null(add_log)) {
        add_log(sprintf("Resolved source_tbl from %s.", attempt$label))
      }
      return(candidate)
    }
  }

  table_label <- if (!is.null(schema_name) && nzchar(schema_name)) sprintf("%s.%s", schema_name, table_name) else table_name
  stop(
    sprintf(
      "Unable to resolve source table %s%s",
      table_label,
      if (!is.null(last_error) && nzchar(last_error)) sprintf(" %s", last_error) else ""
    )
  )
}

execute_script_with_console_capture <- function(script, env) {
  expressions <- parse(text = script, keep.source = FALSE)
  output_buffer <- character()
  message_buffer <- character()
  output_connection <- textConnection("output_buffer", "w", local = TRUE)
  message_connection <- textConnection("message_buffer", "w", local = TRUE)
  output_sink_active <- FALSE
  message_sink_active <- FALSE
  visible_output <- character()

  on.exit({
    if (message_sink_active) {
      sink(type = "message")
    }

    if (output_sink_active) {
      sink()
    }

    try(close(message_connection), silent = TRUE)
    try(close(output_connection), silent = TRUE)
  }, add = TRUE)

  sink(output_connection)
  output_sink_active <- TRUE
  sink(message_connection, type = "message")
  message_sink_active <- TRUE

  last_value <- NULL

  for (expression in expressions) {
    visible_result <- withVisible(eval(expression, envir = env))
    last_value <- visible_result$value

    if (isTRUE(visible_result$visible) && !is.null(visible_result$value)) {
      visible_output <- c(visible_output, capture.output(print(visible_result$value)))
    }
  }

  sink(type = "message")
  message_sink_active <- FALSE
  sink()
  output_sink_active <- FALSE
  try(close(message_connection), silent = TRUE)
  try(close(output_connection), silent = TRUE)

  list(
    last_value = last_value,
    output = c(output_buffer, visible_output),
    messages = message_buffer
  )
}

parse_request_json <- function(request_json) {
  tryCatch(
    jsonlite::fromJSON(request_json %||% "{}", simplifyDataFrame = FALSE),
    error = function(error) build_error_response(error$message)
  )
}

execute_request_body <- function(request_body) {
  if (!is.list(request_body) || !is.null(request_body$error)) {
    return(request_body %||% build_error_response("Invalid tidyverse request payload."))
  }

  script <- trimws(request_body$script %||% "")

  if (!nzchar(script)) {
    return(build_error_response("Tidyverse script is required."))
  }

  params <- request_body$params %||% list()
  payload <- request_body$payload %||% NULL
  upstream <- request_body$upstream %||% list()
  input_dataset <- request_body$dataset %||% NULL
  connection <- request_body$connection %||% NULL
  node <- request_body$node %||% list(id = "tidyverse-node", label = "Tidyverse node")
  logs <- character()
  add_log <- function(...) {
    logs <<- c(logs, paste(..., collapse = " "))
    invisible(NULL)
  }
  db <- NULL

  on.exit({
    if (!is.null(db)) {
      try(DBI::dbDisconnect(db), silent = TRUE)
    }
  }, add = TRUE)

  result <- tryCatch({
    setTimeLimit(elapsed = 20, transient = TRUE)

    if (!is.null(connection)) {
      db <- connect_db(connection)
      add_log(sprintf("Connected to %s on %s:%s.", connection$type, connection$host, connection$port))
    }

    env <- new.env(parent = globalenv())
    env$params <- params
    env$payload <- payload
    env$upstream <- upstream
    env$input_dataset <- input_dataset
    delayedAssign("df_input", dataset_to_tibble(input_dataset), assign.env = env)
    env$connection <- connection
    env$db <- db
    env$source_tbl <- resolve_source_tbl(connection, db, add_log)
    env$get_source_tbl <- function() resolve_source_tbl(connection, db, add_log)
    env$result <- NULL
    env$result_dataset <- NULL
    env$log_message <- function(...) {
      add_log(...)
      invisible(NULL)
    }

    execution <- execute_script_with_console_capture(script, env)

    list(
      result = env$result %||% execution$last_value,
      result_dataset = env$result_dataset,
      console_output = c(execution$output, execution$messages)
    )
  }, error = function(error) {
    return(build_error_response(error$message))
  }, finally = {
    setTimeLimit(cpu = Inf, elapsed = Inf, transient = FALSE)
  })

  if (!is.list(result) || !is.null(result$error)) {
    return(result)
  }

  result_value <- result$result
  result_dataset <- result$result_dataset
  result_console_output <- result$console_output %||% character()

  if (inherits(result_value, c("data.frame", "tbl_df", "tbl"))) {
    result_dataset <- result_value
    result_value <- NULL
  }

  if (is.list(result_value) && !is.null(result_value$dataset) && inherits(result_value$dataset, c("data.frame", "tbl_df", "tbl"))) {
    result_dataset <- result_value$dataset
  }

  response_dataset <- NULL

  if (!is.null(result_dataset)) {
    response_dataset <- studio_dataset_from_df(as.data.frame(result_dataset, stringsAsFactors = FALSE), sprintf("%s result", node$label %||% "Tidyverse node"))
  } else if (is.list(result_value) && !is.null(result_value$dataset)) {
    response_dataset <- result_value$dataset
  }

  result_logs <- if (is.list(result_value) && !is.null(result_value$logs)) unlist(result_value$logs) else character()
  result_outputs <- if (is.list(result_value) && !is.null(result_value$outputs)) {
    if (is.list(result_value$outputs)) result_value$outputs else list(value = result_value$outputs)
  } else {
    list()
  }
  result_summary <- if (is.list(result_value) && !is.null(result_value$summary)) as.character(result_value$summary) else sprintf("%s executed in tidyverse.", node$label %||% "Tidyverse node")
  result_status <- if (is.list(result_value) && !is.null(result_value$status)) as.character(result_value$status) else "success"
  console_logs <- Filter(function(line) nzchar(trimws(line)), as.character(result_console_output))
  viewer_payload <- build_viewer_payload(response_dataset, result_outputs, result_value, node$label %||% "Tidyverse node")

  if (!is.null(viewer_payload)) {
    result_outputs$`__ireconxViewer` <- viewer_payload
  }

  response <- list(
    protocolVersion = PLUGIN_PROTOCOL_VERSION,
    status = result_status,
    summary = result_summary
  )

  if (!is.null(response_dataset)) {
    response$dataset <- response_dataset
  }

  if (length(result_outputs) > 0) {
    response$outputs <- result_outputs
  }

  combined_logs <- c(logs, console_logs, result_logs)

  if (length(combined_logs) > 0) {
    response$logs <- unname(as.list(combined_logs))
  }

  response
}

execute_request_file <- function(request_path) {
  request_json <- tryCatch(
    paste(readLines(request_path, warn = FALSE), collapse = "\n"),
    error = function(error) {
      return(build_error_response(error$message))
    }
  )

  if (is.list(request_json) && !is.null(request_json$error)) {
    return(request_json)
  }

  execute_request_body(parse_request_json(request_json))
}

write_json_response <- function(response) {
  cat(jsonlite::toJSON(response, auto_unbox = TRUE, null = "null"))
  invisible(NULL)
}

args <- commandArgs(trailingOnly = TRUE)

if (length(args) >= 2 && identical(args[[1]], "--execute-request")) {
  write_json_response(execute_request_file(args[[2]]))
  quit(save = "no", status = 0, runLast = FALSE)
}

stop("Use --execute-request <json-file> to execute tidyverse code.")
