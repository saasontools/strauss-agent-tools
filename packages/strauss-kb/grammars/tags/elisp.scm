; Wilfred/tree-sitter-elisp queries/tags.scm @ 0cbf0906d9ee707c8c109422fba9cdd17ae13dcf
;; defun/defsubst
(function_definition name: (symbol) @name) @definition.function

;; Treat macros as function definitions for the sake of TAGS.
(macro_definition name: (symbol) @name) @definition.function
