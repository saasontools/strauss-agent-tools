; tree-sitter/tree-sitter-python queries/tags.scm @ 26855eabccb19c6abf499fbc5b8dc7cc9ab8bc64
(module (expression_statement (assignment left: (identifier) @name) @definition.constant))

(class_definition
  name: (identifier) @name) @definition.class

(function_definition
  name: (identifier) @name) @definition.function

(call
  function: [
      (identifier) @name
      (attribute
        attribute: (identifier) @name)
  ]) @reference.call
