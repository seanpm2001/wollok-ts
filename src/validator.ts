// TODO:

// No imports of local references

import { isNil, keys, reject } from 'ramda'
import {
  Assignment, Class, ClassMember, Constructor, Environment, Field, Import, Method, Mixin,
  Node, NodeKind, NodeOfKind, Package, Parameter, Program, Reference, Singleton, Test, Try, Variable
} from './model'
import utils from './utils'

type Code = string
type Level = 'Warning' | 'Error'

export interface Problem {
  readonly code: Code
  readonly level: Level
  readonly node: Node
}

const problem = (level: Level) => <N extends Node>(condition: (node: N) => boolean) => (node: N, code: Code): Problem | null =>
  !condition(node) ? {
    level,
    code,
    node,
  } : null

const warning = problem('Warning')

const error = problem('Error')

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// VALIDATIONS
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════

type HaveArgs = Method | Constructor
type notEmpty = Program | Test

const canBeCalledWithArgs = (member1: HaveArgs, member2: HaveArgs) =>
  ((member2.parameters[member2.parameters.length - 1].isVarArg && member1.parameters.length >= member2.parameters.length)
    || member2.parameters.length === member1.parameters.length) && member1 !== member2

const matchingConstructors =
  (list: ReadonlyArray<ClassMember>, member: Constructor) =>
    list.some(m => m.kind === 'Constructor' && canBeCalledWithArgs(m, member))

const matchingSignatures =
  (list: ReadonlyArray<ClassMember>, member: Method) =>
    list.some(m => m.kind === 'Method' && m.name === member.name && canBeCalledWithArgs(m, member))

const bodyIsNotEmpty = (node: notEmpty) => node.body!.sentences.length !== 0

export const validations = (environment: Environment) => {
  const { parentOf } = utils(environment)

  return {

    nameIsPascalCase: warning<Mixin | Class>(node =>
      /^[A-Z]$/.test(node.name[0])
    ),

    nameIsCamelCase: warning<Parameter | Singleton | Variable>(node => node.name !== undefined &&
      /^[a-z]$/.test(node.name[0])
    ),

    onlyLastParameterIsVarArg: error<Method>(node =>
      node.parameters.findIndex(p => p.isVarArg) + 1 === (node.parameters.length)
    ),

    nameIsNotKeyword: error<Reference | Method | Variable>(node => !['.', ',', '(', ')', ';', '_', '{', '}',
      'import', 'package', 'program', 'test', 'mixed with', 'class', 'inherits', 'object', 'mixin',
      'var', 'const', '=', 'override', 'method', 'native', 'constructor',
      'self', 'super', 'new', 'if', 'else', 'return', 'throw', 'try', 'then always', 'catch', ':', '+',
      'null', 'false', 'true', '=>'].includes(node.name)),

    hasCatchOrAlways: error<Try>(t => t.catches.length !== 0 || t.always.sentences.length !== 0 && t.body.sentences.length !== 0),

    singletonIsNotUnnamed: error<Singleton>(node => (parentOf(node).kind === 'Package') && node.name !== undefined),

    importHasNotLocalReference: error<Import>(node =>
      (parentOf(node) as Package).members.every(({ name }) => name !== node.reference.name)
    ),

    nonAsignationOfFullyQualifiedReferences: error<Assignment>(node => !node.reference.name.includes('.')),

    fieldNameDifferentFromTheMethods: error<Field>(node => (parentOf(node) as Class).members.
      filter((member): member is Method => member.kind === 'Method').every(({ name }) => name !== node.name)),

    methodsHaveDistinctSignatures: error<Class>(node => node.members
      .every(member => member.kind === 'Method'
        && !matchingSignatures(node.members, member)
      )),

    constructorsHaveDistinctArity: error<Constructor>(node => (parentOf(node) as Class).members
      .every(member => member.kind === 'Constructor'
        && !matchingConstructors((parentOf(node) as Class).members, member)
      )),

    methodNotOnlyCallToSuper: warning<Method>(node => !(node.body!.sentences.length === 1 && node.body!.sentences[0].kind === 'Super')),

    testIsNotEmpty: warning<Test>(node => bodyIsNotEmpty(node)),

    programIsNotEmpty: warning<Program>(node => bodyIsNotEmpty(node)),
  }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// PROBLEMS BY KIND
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════

export default (target: Node, environment: Environment): ReadonlyArray<Problem> => {
  const { reduce } = utils(environment)

  const {
    nameIsPascalCase,
    nameIsCamelCase,
    nameIsNotKeyword,
    onlyLastParameterIsVarArg,
    hasCatchOrAlways,
    singletonIsNotUnnamed,
    importHasNotLocalReference,
    nonAsignationOfFullyQualifiedReferences,
    fieldNameDifferentFromTheMethods,
    methodsHaveDistinctSignatures,
    constructorsHaveDistinctArity,
    methodNotOnlyCallToSuper,
    programIsNotEmpty,
    testIsNotEmpty,
  } = validations(environment)

  const problemsByKind: { [K in NodeKind]: { [code: string]: (n: NodeOfKind<K>, c: Code) => Problem | null } } = {
    Parameter: { nameIsCamelCase, },
    Import: { importHasNotLocalReference },
    Body: {},
    Catch: {},
    Package: {},
    Program: { programIsNotEmpty },
    Test: { testIsNotEmpty },
    Class: { nameIsPascalCase, methodsHaveDistinctSignatures },
    Singleton: { nameIsCamelCase, singletonIsNotUnnamed },
    Mixin: { nameIsPascalCase },
    Constructor: { constructorsHaveDistinctArity },
    Field: { fieldNameDifferentFromTheMethods },
    Method: { onlyLastParameterIsVarArg, nameIsNotKeyword, methodNotOnlyCallToSuper },
    Variable: { nameIsCamelCase, nameIsNotKeyword },
    Return: {},
    Assignment: { nonAsignationOfFullyQualifiedReferences },
    Reference: { nameIsNotKeyword },
    Self: {},
    New: {},
    Literal: {},
    Send: {},
    Super: {},
    If: {},
    Throw: {},
    Try: { hasCatchOrAlways },
    Environment: {},
    Describe: {},
  }

  return reduce<Problem[]>((found, node) => {
    const checks = problemsByKind[node.kind] as { [code: string]: (n: Node, c: Code) => Problem | null }
    return [
      ...found,
      ...reject(isNil)(keys(checks).map(code => checks[code](node, code))),
    ]
  })([], target)
}