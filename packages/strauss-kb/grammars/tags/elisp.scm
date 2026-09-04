; https://cdn.jsdelivr.net/npm/tree-sitter-elisp@1.5.0/queries/tags.scm
;; defun/defsubst
(function_definition name: (symbol) @name) @definition.function

;; Treat macros as function definitions for the sake of TAGS.
(macro_definition name: (symbol) @name) @definition.function
