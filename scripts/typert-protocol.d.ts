/*
 * Standalone declaration of the `@deepseek-ai/dsh-typert-protocol` surface this
 * package's Typert analysis depends on, mirroring DSH `0.2.0-rc.2`.
 *
 * The Typert generator analyzes a temporary, self-contained workspace that has
 * no `node_modules`, so `scripts/generate-typert.mjs` maps this module name
 * here. Keep it in sync with the pinned baseline in HARNESS_BASELINE.md: it
 * only needs to describe what `src/` uses and what the generated
 * `typert.remote-client.d.ts` augments.
 */
declare module '@deepseek-ai/dsh-typert-protocol' {
  /** Merge-extensible direct Remote method signatures generated for consumers. */
  export interface TypertRemoteMap {}
  /** Merge-extensible scoped Remote method signatures generated for consumers. */
  export interface TypertRemoteScopeMap {}
  /** Merge-extensible namespace-to-signature map generated for consumers. */
  export interface TypertRemoteNamespaceMap {}

  /** One Remote call's failure as the Client observes it. */
  export interface RemoteFailure {
    readonly code: string
    readonly message: string
    readonly details: object
  }

  /** What every generated Remote method resolves to. */
  export type RemoteResult<T> =
    | { readonly ok: true; readonly value: T }
    | { readonly ok: false; readonly error: RemoteFailure }

  /** One open Remote stream as the Client holds it. */
  export interface RemoteStreamHandle<Out, In> extends AsyncIterable<Out> {
    send(item: In): void
    end(): void
    dispose(): void
  }

  /** Awaitable disposer returned by Cordis-owned Typert registrations. */
  export type TypertDisposer = () => Promise<void>

  /** Consumer-side invocation descriptor generated from a Host package. */
  export interface InvocationDescriptor {
    readonly id: string
    readonly service: string
    readonly namespace: string
    readonly method: string
    readonly implementation?: string
    readonly mode?: 'stream'
    readonly invocation: { readonly kind: 'direct' } | { readonly kind: 'context'; readonly context: string }
    readonly parameters: readonly unknown[]
    readonly result: unknown
  }

  /** One generated Host-for-Client contribution. */
  export interface TypertRemoteContribution {
    readonly package: string
    readonly descriptors: readonly InvocationDescriptor[]
  }

  /** Visible binding consumed by the Gateway's source-mode discovery. */
  export interface TypertGatewayBinding<Service extends object = object> {
    readonly service: Service
    readonly serviceKey: string
    readonly namespace: string
  }

  /** Cordis Service base that exposes its registered name through Typert Gateway. */
  export abstract class TypertRemoteService<T = never> {
    readonly typertRemote: TypertGatewayBinding<this>
    protected constructor(
      ctx: unknown,
      serviceKey: string,
      options?: { readonly namespace?: string },
    )
  }

  /** Mark one public instance method as a direct Remote invocation. */
  export function Remote<This extends object, Args extends unknown[], Result>(
    method: (this: This, ...args: Args) => Result,
    context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Result>,
  ): void

  /** Mark one public instance method under an exported name. */
  export function Remote(option: string): <This extends object, Args extends unknown[], Result>(
    method: (this: This, ...args: Args) => Result,
    context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Result>,
  ) => void

  /** One decorator marker discovered for a live Service instance. */
  export interface RemoteMethodMarker {
    readonly method: string
    readonly exportName?: string
    readonly mode?: 'stream'
    readonly invocation: { readonly kind: 'direct' } | { readonly kind: 'context'; readonly context: string }
  }

  /** Read Remote markers attached to a live Service's class prototype. */
  export function remoteMethods(service: object): readonly RemoteMethodMarker[]
}
