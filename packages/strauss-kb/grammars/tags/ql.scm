; tree-sitter/tree-sitter-ql queries/tags.scm @ 5b8ee9adaa1f2a1ea958064b61f8feb0a5a886c0
(classlessPredicate
  name: (predicateName) @name) @definition.function

(memberPredicate
  name: (predicateName) @name) @definition.method

(aritylessPredicateExpr
  name: (literalId) @name) @reference.call

(module
  name: (moduleName) @name) @definition.module

(dataclass
  name: (className) @name) @definition.class

(datatype
  name: (className) @name) @definition.class

(datatypeBranch
  name: (className) @name) @definition.class

(qualifiedRhs
  name: (predicateName) @name) @reference.call

(typeExpr
  name: (className) @name) @reference.type
