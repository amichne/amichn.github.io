---
title: "No (More) Strings Attached: Type-Safe Feature Flags"
date: 2025-10-25
layout: post.njk 
tags: [ "type-safe", "design", "framework" ]
---

# No (More) Strings Attached: Type-Safe Feature Flags
## Un-un-Konditional Love

_This post explores how [Konditional](https://amichne.github.io/konditional/), a type-safe feature flag library, uses the Kotlin type system to prevent runtime errors and improve code quality._

_It is heavily inspired by the ["Parse, Don't Validate"](https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/) essay by Alexis King._

## We Need to Talk (about feature flags)

If you've worked with feature flags in production, you've probably written code like this:

```kotlin
val config = featureFlags.getString("api_endpoint")
if (config == null) {
    // What do we do here? Log? Crash? Use a hardcoded default?
    throw IllegalStateException("Missing required config")
}
```

Or maybe this:

```kotlin
val darkMode = featureFlags.getBoolean("dark_mode") // Returns Boolean?
if (darkMode == true) {
    // Why do we need the explicit true check?
    // Because it could be null, and null != true
    applyDarkTheme()
}
```

These aren't bad programmers. These are good programmers working with bad tools. Traditional feature flag systems force you to validate at every call site because the type system can't express what you actually know: **this flag exists, and it returns this specific type**.

Let me show you a different approach.

## Imagine What We Could Be

Feature flags serve a simple purpose: they return different values for different contexts. You might want dark mode enabled for premium users, or the new checkout flow shown to 25% of iOS users, or a different API endpoint for web versus mobile platforms.

The core operation is straightforward:
```
(Context, Flag) → Value
```

But somehow, in most feature flag libraries, this simple function becomes:
```
(String, String) → Any?
```

We've lost three critical pieces of information:
1. **Which flags exist** (flag name is just a string)
2. **What type each flag returns** (values are untyped)
3. **What context we can match on** (context is a string-based key-value map)

Konditional recovers all three. The same operation becomes:
```kotlin
fun <S : Any, C : Context> C.evaluate(key: Conditional<S, C>): S
```

Notice what changed: we've encoded the relationship between a specific flag, its value type, and its context type **in the signature**. If you call `context.evaluate(Features.DARK_MODE)`, you get a `Boolean`. If you call `context.evaluate(ApiConfig.ENDPOINT)`, you get a `String`. No casting, no null checks, no runtime surprises.

## It's not you, it's Stringly-Typed Feature Flags

Let's look at what goes wrong with traditional approaches. Here's typical feature flag code:

```kotlin
// LaunchDarkly-style API
val darkModeEnabled = ldClient.boolVariation("dark-mode", user, false)
val apiEndpoint = ldClient.stringVariation("api-endpoint", user, "https://api.prod.example.com")
```

This looks innocuous, but it has several critical problems:

**Problem 1: Typos are runtime errors**
```kotlin
// Somewhere in your code
val darkMode = ldClient.boolVariation("dark-mode", user, false)

// Somewhere else
val darkMode = ldClient.boolVariation("dark-mdoe", user, false) // Oops! Always returns false
```

The compiler can't help you here. You've just shipped a bug.

**Problem 2: Type mismatches are runtime errors**
```kotlin
// Original config: "api-endpoint" is a string
val endpoint = ldClient.stringVariation("api-endpoint", user, "https://api.prod.example.com")

// Later, someone changes the remote config to return a boolean by mistake
val endpoint = ldClient.stringVariation("api-endpoint", user, "https://api.prod.example.com")
// Returns the default string, silently masking the misconfiguration
```

**Problem 3: You can't refactor safely**
```kotlin
// You want to rename "dark-mode" to "dark-theme"
// Good luck finding every string literal across your codebase
// Better hope no one missed one, or typo'd the new name
```

**Problem 4: The default value repeats everywhere**
```kotlin
// How many places do you have this default?
val darkMode = ldClient.boolVariation("dark-mode", user, false)
// What happens when the defaults disagree?
val darkMode = ldClient.boolVariation("dark-mode", user, true) // Oops
```

These aren't theoretical problems. They happen in real codebases, all the time, and the type system has no way to help you catch them.

## (Don't) Validate me

In her excellent essay "Parse, Don't Validate," Alexis King argues that validation should **parse** inputs into more refined types, preserving the information that validation succeeded within the type system. The classic example is:

```haskell
-- Validation: throws information away
validateNonEmpty :: [a] -> ()

-- Parsing: preserves information in the type
parseNonEmpty :: [a] -> Maybe (NonEmpty a)
```

With `validateNonEmpty`, you know the list was valid *at some point*, but you have to trust that you haven't modified it since. With `parseNonEmpty`, the type system guarantees the list is non-empty **wherever you hold a `NonEmpty a`**.

Feature flags have the same problem. When you call:
```kotlin
val endpoint = ldClient.stringVariation("api-endpoint", user, "default")
```

You get a `String`, but you've **validated** (implicitly) that:
1. A flag called "api-endpoint" exists
2. It's configured to return strings
3. The evaluation logic completed successfully

Then you immediately throw this information away. The type system only sees `String`, with no memory of where it came from or what guarantees you have about it.

Konditional's approach is to **parse** instead:

```kotlin
enum class ApiConfig(override val key: String) : Conditional<String, Context> {
    ENDPOINT("api_endpoint"),
}

val endpoint: String = context.evaluate(ApiConfig.ENDPOINT)
```

Now the type system knows:
1. `ApiConfig.ENDPOINT` is a specific, known flag (not an arbitrary string)
2. It returns `String` (encoded in `Conditional<String, Context>`)
3. The result is never null (the signature is `C.evaluate(key: Conditional<S, C>): S`, not `S?`)

## Wow, you're so strong(ly typed)

Let me show you how Konditional achieves this. The journey from string-based flags to type-safe flags required solving several interconnected problems.

### Problem 1: How do you store heterogeneous flag types in a single map?

You might think: just use a map!
```kotlin
val flags: Map<String, Any> = mapOf(
    "dark-mode" to true,
    "api-endpoint" to "https://api.example.com"
)
```

But now you've lost type information. When you retrieve `flags["dark-mode"]`, you get `Any`, and you're back to casting:
```kotlin
val darkMode = flags["dark-mode"] as Boolean // Unchecked cast warning
```

Konditional's solution is the `FlagEntry` wrapper (from [`Flags.kt:19-27`](https://github.com/amichne/konditional/blob/3e67c1609e5b81f10956e3d87cb567db2513b5f1/src/main/kotlin/io/amichne/konditional/core/Flags.kt#L19-L27)):

```kotlin
class FlagEntry<S : Any, C : Context>(
    val flag: ContextualFeatureFlag<S, C>
) {
    fun evaluate(context: C): S = flag.evaluate(context)
}
```

Each flag is wrapped in a `FlagEntry` that maintains the relationship between its value type `S` and context type `C`. The actual flag implementation is a `FlagDefinition<S, C>` (previously called `Condition`), but it's exposed through the minimal `ContextualFeatureFlag<S, C>` interface. This hides implementation details like bucketing algorithms and rule matching while preserving type safety.

The storage map becomes:

```kotlin
private val snapshot: Map<Conditional<*, *>, FlagEntry<*, *>>
```

At the map level, we use existential types (`*`) to allow heterogeneous storage. But when we retrieve a flag, we use the `Conditional<S, C>` key to recover the types:

```kotlin
fun <S : Any, C : Context> C.evaluate(key: Conditional<S, C>): S {
    val entry = current.get().flags[key] as? FlagEntry<S, C>
        ?: throw IllegalStateException("Flag not configured: ${key.key}")
    return entry.evaluate(this)
}
```

The cast from `FlagEntry<*, *>` to `FlagEntry<S, C>` is technically unchecked (due to type erasure), but it's **structurally safe**: if the key is a `Conditional<S, C>`, the associated entry *must* be a `FlagEntry<S, C>`, because that's the invariant we maintain when inserting flags.

This is the "parse" moment: we've refined the existential type `FlagEntry<*, *>` back into the precise type `FlagEntry<S, C>`, using the key as evidence.

### Problem 2: How do you define flags with different types?

In the string-based world, all flags look the same:
```kotlin
client.boolVariation("dark-mode", user, false)
client.stringVariation("api-endpoint", user, "default")
```

Konditional uses enums, where each enum gets its own value type:

```kotlin
enum class Features(override val key: String) : Conditional<Boolean, Context> {
    DARK_MODE("dark_mode"),
    NEW_CHECKOUT("new_checkout"),
}

enum class ApiConfig(override val key: String) : Conditional<String, Context> {
    ENDPOINT("api_endpoint"),
}
```

Notice `Features` implements `Conditional<Boolean, Context>` while `ApiConfig` implements `Conditional<String, Context>`. The compiler now knows:
- All flags in `Features` return `Boolean`
- All flags in `ApiConfig` return `String`

You can't accidentally mix them:
```kotlin
val endpoint: String = context.evaluate(Features.DARK_MODE) // Compiler error!
// Required: String
// Found: Boolean
```

### Problem 3: How do you configure flags without losing type safety?

Configuration is where things get interesting. We want a DSL that looks like this:

```kotlin
Features.DARK_MODE with {
    default(false)
    rule {
        platforms(Platform.IOS)
    } implies true
}
```

Notice the `implies` keyword: it connects a rule (the `rule { }` block) with a value (`true`). But how do we ensure the value matches the flag's type?

The answer is in the generic parameters. Here's the `FlagBuilder` signature (from [`FlagBuilder.kt:19-85`](https://github.com/amichne/konditional/blob/3e67c1609e5b81f10956e3d87cb567db2513b5f1/src/main/kotlin/io/amichne/konditional/builders/FlagBuilder.kt#L19-L85)):

```kotlin
class FlagBuilder<S : Any, C : Context>(
    private val key: Conditional<S, C>
) {
    fun default(value: S) { ... }

    infix fun Rule<C>.implies(value: S): TargetedValue<S, C> {
        return TargetedValue(this, value)
    }
}
```

The builder is parameterized by the same `S` and `C` as the flag. So when you write:
```kotlin
Features.DARK_MODE with { ... }
```

The `with` function creates a `FlagBuilder<Boolean, Context>`, because `Features.DARK_MODE` is a `Conditional<Boolean, Context>`. Now:
- `default(value)` requires a `Boolean`
- `implies(value)` requires a `Boolean`
- The compiler enforces this everywhere

If you try:
```kotlin
Features.DARK_MODE with {
    default(false)
    rule { } implies "wrong type"  // Compiler error!
}
```

The compiler rejects it: `implies` expects `Boolean`, found `String`.

### Problem 4: How do you make evaluation deterministic?

This is where we dive into the "how" of deterministic bucketing. Feature flag rollouts typically work like this:
- "Show feature X to 25% of users"
- "Increase to 50% tomorrow"
- "Full rollout to 100% next week"

The critical requirement: **the same user must stay in the same bucket** across these changes. If user A sees the feature at 25%, they should still see it at 50% and 100%. Otherwise you create a horrible user experience where features flicker on and off.

The traditional approach is random assignment:
```kotlin
if (Random.nextDouble() < 0.25) {
    showNewFeature()
}
```

But this is non-deterministic: the same user gets a different result each time. You need stable, deterministic bucketing.

Konditional uses SHA-256 hashing (from [`FlagDefinition.kt:69-83`](https://github.com/amichne/konditional/blob/3e67c1609e5b81f10956e3d87cb567db2513b5f1/src/main/kotlin/io/amichne/konditional/core/FlagDefinition.kt#L69-L83)):

```kotlin
private fun stableBucket(flagKey: String, id: StableId, salt: String): Int {
    val hash = MessageDigest.getInstance("SHA-256")
    val input = "$salt:$flagKey:${id.id}".toByteArray()
    val digest = hash.digest(input)

    // Extract first 4 bytes as unsigned 32-bit integer
    val hashInt = ((digest[0].toInt() and 0xFF) shl 24) or
                  ((digest[1].toInt() and 0xFF) shl 16) or
                  ((digest[2].toInt() and 0xFF) shl 8) or
                  (digest[3].toInt() and 0xFF)

    // Map to 0-9999 range
    return (hashInt.toLong() and 0xFFFF_FFFFL).mod(10_000L).toInt()
}
```

Then bucketing becomes:
```kotlin
fun isInEligibleSegment(rollout: Rollout): Boolean {
    val bucket = stableBucket(flagKey, stableId, salt)
    return bucket < (rollout.value * 100).roundToInt()
}
```

Why this works:
1. **Deterministic**: SHA-256 is a deterministic function—same input always produces same output
2. **Uniform**: SHA-256 distributes uniformly, so `bucket` is evenly distributed over 0-9999
3. **Independent**: Each flag has its own bucketing space (via `flagKey` in the hash input), so being in the 25% bucket for feature A doesn't correlate with being in the 25% bucket for feature B
4. **Stable**: User stays in the same bucket as you increase rollout percentage (bucket 2500 is in both the 25% and 50% rollouts)

The salt parameter allows you to "re-shuffle" users if needed, but defaults to a stable value.

### Problem 5: How do you match rules without stringly-typed context?

Traditional feature flag systems use key-value context:
```kotlin
val context = mapOf(
    "platform" to "ios",
    "version" to "2.5.0",
    "locale" to "en_US"
)
```

This has all the problems of string-based flags: typos, type mismatches, no refactoring support.

Konditional makes context strongly-typed (from [`Context.kt:14-33`](https://github.com/amichne/konditional/blob/3e67c1609e5b81f10956e3d87cb567db2513b5f1/src/main/kotlin/io/amichne/konditional/context/Context.kt#L14-L33)):

```kotlin
interface Context {
    val locale: AppLocale
    val platform: Platform
    val appVersion: Version
    val stableId: StableId
}
```

Now matching becomes type-safe:
```kotlin
rule {
    platforms(Platform.IOS, Platform.ANDROID)  // Enum, not string
    locales(AppLocale.EN_US)                   // Enum, not string
    versions {
        min(2, 0)  // Version object, not string
    }
}
```

The compiler ensures:
- You can't pass invalid platform names
- You can't typo locale codes
- Version comparisons are semantic, not string-based

### Problem 6: How do you ensure more specific rules win?

When you have multiple rules, you need an ordering. Konditional uses **specificity**: rules with more constraints are more specific and should match first.

For example:
```kotlin
// Rule A: iOS users on version 2.0+
rule {
    platforms(Platform.IOS)
    versions { min(2, 0) }
} implies true

// Rule B: iOS users (any version)
rule {
    platforms(Platform.IOS)
} implies false
```

An iOS user on version 2.5 matches both rules, but Rule A is more specific (2 constraints vs 1), so it wins.

Specificity is calculated by the `UserClientEvaluator` (from [`UserClientEvaluator.kt`](https://github.com/amichne/konditional/blob/3e67c1609e5b81f10956e3d87cb567db2513b5f1/src/main/kotlin/io/amichne/konditional/rules/evaluable/UserClientEvaluator.kt)):
```kotlin
internal override fun specificity(): Int =
    (if (locales.isNotEmpty()) 1 else 0) +
    (if (platforms.isNotEmpty()) 1 else 0) +
    (if (versionRange.hasBounds()) 1 else 0)
```

Rules are pre-sorted at configuration time (from [`FlagDefinition.kt:28-31`](https://github.com/amichne/konditional/blob/3e67c1609e5b81f10956e3d87cb567db2513b5f1/src/main/kotlin/io/amichne/konditional/core/FlagDefinition.kt#L28-L31)):
```kotlin
val targetedValues = bounds.sortedWith(
    compareByDescending<TargetedValue<S, C>> { it.rule.specificity() }
        .thenBy { it.rule.note ?: "" }
)
```

Then evaluation is simple: iterate through sorted rules, return the first match. No complex precedence rules, no ambiguity.

## It's complicated (but hear me out)

Every design decision in Konditional stems from one principle: **make illegal states unrepresentable**. Let me walk through the key choices and their motivation.

### Choice 1: Enums for flag definitions

**Why not strings?** Strings allow typos, can't be refactored, and provide no IDE support.

**Why not data classes?** You could do:
```kotlin
data class Flag<S>(val key: String)
val DARK_MODE = Flag<Boolean>("dark_mode")
```

But then nothing prevents:
```kotlin
val DARK_MODE = Flag<Boolean>("dark_mode")
val OTHER_DARK_MODE = Flag<String>("dark_mode")  // Same key, different type!
```

Enums provide:
- Exhaustiveness checking
- Single source of truth for flag names
- IDE autocomplete
- Safe refactoring

### Choice 2: Generic type parameters throughout

**Why not use a common supertype?** You could make all flags return `Any`:
```kotlin
interface Flag {
    fun evaluate(context: Context): Any
}
```

Then cast at call sites:
```kotlin
val darkMode = Features.DARK_MODE.evaluate(context) as Boolean
```

This loses all type safety. Konditional instead threads the type parameters through the entire system:
```
Conditional<S, C> → FlagDefinition<S, C> → TargetedValue<S, C> → Rule<C>
```

At every step, the compiler knows the exact types involved.

### Choice 3: SHA-256 for bucketing

**Why not random assignment?** Non-deterministic, as discussed above.

**Why not simpler hashing (e.g., `hashCode % 10000`)?** Kotlin's `hashCode()` doesn't guarantee uniformity or stability across platforms/versions. SHA-256 does.

**Why 10,000 buckets?** Allows 0.01% precision in rollout percentages, which is fine-grained enough for gradual rollouts without being excessive.

### Choice 4a: Evaluable abstraction for composable rules

**Why create an abstraction for rule evaluation?** Initially, Rule was a simple data class. But as the library evolved, we needed extensibility—custom matching logic for domain-specific requirements.

The `Evaluable<C>` abstraction (from [`Evaluable.kt:22-46`](https://github.com/amichne/konditional/blob/3e67c1609e5b81f10956e3d87cb567db2513b5f1/src/main/kotlin/io/amichne/konditional/rules/evaluable/Evaluable.kt#L22-L46)) provides the foundation:

```kotlin
abstract class Evaluable<C : Context> {
    internal open fun matches(context: C): Boolean = true
    internal open fun specificity(): Int = 0
}
```

This enables composition. The `Rule` class composes two evaluators:
- `UserClientEvaluator`: handles standard locale/platform/version matching
- `extension`: custom evaluation logic for domain-specific rules

```kotlin
data class Rule<C : Context>(
    val rollout: Rollout,
    val userClientEvaluator: UserClientEvaluator<C>,
    val extension: Evaluable<C>
) : Evaluable<C>() {
    override fun matches(context: C): Boolean =
        userClientEvaluator.matches(context) && extension.matches(context)

    override fun specificity(): Int =
        userClientEvaluator.specificity() + extension.specificity()
}
```

This design allows extending rule matching without modifying the core framework. Users can create custom evaluators that compose with the standard client targeting.

**Why mark methods as `internal`?** The `matches()` and `specificity()` methods are implementation details. External code shouldn't call them directly—they're invoked internally during flag evaluation. This reduces the public API surface and prevents misuse.

### Choice 5: Atomic snapshots for concurrency

**Why not locks?** Locks on the read path hurt performance. Feature flag evaluation happens in hot paths—every request might evaluate dozens of flags.

**Why not lockless individual flag updates?** You'd need synchronization on each flag's configuration, adding complexity.

Atomic snapshots (`AtomicReference<Snapshot>`) provide:
- Lock-free reads (just dereference the atomic)
- Simple update model (create new snapshot, swap it in)
- Consistent view (all flags from same snapshot)

From [`Flags.kt:29-30`](https://github.com/amichne/konditional/blob/3e67c1609e5b81f10956e3d87cb567db2513b5f1/src/main/kotlin/io/amichne/konditional/core/Flags.kt#L29-L30):
```kotlin
private val current = AtomicReference(Snapshot(emptyMap()))
```

Reads are:
```kotlin
val snapshot = current.get()  // Atomic, lock-free
```

Writes are:
```kotlin
current.set(newSnapshot)  // Atomic replacement
```

### Choice 6: Context polymorphism

**Why not fix the context type?** Different applications need different context. An enterprise SaaS app might need organization IDs and subscription tiers. A mobile game might need player level and in-game currency.

Making context generic (`Conditional<S, C>` where `C : Context`) allows extending the base interface:

```kotlin
data class EnterpriseContext(
    override val locale: AppLocale,
    override val platform: Platform,
    override val appVersion: Version,
    override val stableId: StableId,
    val organizationId: String,
    val subscriptionTier: SubscriptionTier,
    val userRole: UserRole,
) : Context
```

Now you can write enterprise-specific flags:
```kotlin
enum class EnterpriseFeatures(override val key: String)
    : Conditional<Boolean, EnterpriseContext> {
    ADVANCED_ANALYTICS("advanced_analytics"),
}
```

The type system ensures you can't evaluate an `EnterpriseFeatures` flag with a regular `Context`—you need an `EnterpriseContext`.

### Choice 7: Composition over inheritance for custom rules

With the `Evaluable` abstraction in place, custom matching logic becomes straightforward through composition. You create custom evaluators that extend `Evaluable<C>`:

```kotlin
data class SubscriptionEvaluator<C : EnterpriseContext>(
    val requiredTier: SubscriptionTier
) : Evaluable<C>() {
    override fun matches(context: C): Boolean =
        context.subscriptionTier >= requiredTier

    override fun specificity(): Int = 1
}
```

Then compose it with a rule:

```kotlin
Rule(
    rollout = Rollout.of(100.0),
    platforms = setOf(Platform.WEB),
    extension = SubscriptionEvaluator(SubscriptionTier.PREMIUM)
)
```

This rule matches web platform users with premium subscriptions. The specificity is 1 (platform) + 1 (subscription tier) = 2.

**Why composition instead of inheritance?** Rules are data—they're serialized to JSON for remote configuration. Inheritance complicates serialization and creates tight coupling. Composition keeps `Rule` simple while enabling unlimited extensibility through custom `Evaluable` implementations.

### Choice 8: Serialization support

Recent commits (commit `efdc912`) added serialization. Why?

In production, you don't hardcode flag configuration—you fetch it from a remote service. This allows changing flags without deploying code.

Konditional's serialization (from [`SnapshotSerializer.kt`](https://github.com/amichne/konditional/blob/3e67c1609e5b81f10956e3d87cb567db2513b5f1/src/main/kotlin/io/amichne/konditional/serialization/SnapshotSerializer.kt)) converts:
```
Snapshot → SerializableSnapshot → JSON
```

The challenge: how do you serialize generic types? You can't directly serialize `Condition<Boolean, Context>` because type information is erased.

The solution: runtime type tracking via `ValueType` enum:
```kotlin
enum class ValueType {
    BOOLEAN, STRING, INT, LONG, DOUBLE
}
```

When serializing:
```kotlin
val type = when (defaultValue) {
    is Boolean -> ValueType.BOOLEAN
    is String -> ValueType.STRING
    // ...
}
```

When deserializing, we use a `ConditionalRegistry` that maps flag keys to `Conditional` instances:
```kotlin
object ConditionalRegistry {
    private val registry = ConcurrentHashMap<String, Conditional<*, *>>()

    fun register(conditional: Conditional<*, *>) {
        registry[conditional.key] = conditional
    }
}
```

This allows reconstructing type information:
```kotlin
val conditional = ConditionalRegistry.get(key)
val flagDefinition = deserializeFlagDefinition(json, conditional)
// Type parameters recovered from registered Conditional
```

This is another "parse, don't validate" moment: we parse JSON back into typed `FlagDefinition<S, C>` objects, using the registry as evidence of types.

## This could be us

Let's contrast the before and after for a real scenario: rolling out a new checkout flow to 25% of iOS users on version 2.0+.

**Traditional approach:**
```json5
// Configuration (separate system, maybe JSON)
{
  "new-checkout": {
    "enabled": true,
    "rollout": 0.25,
    "rules": [
      {"platform": "ios", "minVersion": "2.0.0"}
    ]
  }
}
```

```kotlin
// Application code
val isEnabled = ldClient.boolVariation(
    "new-checkout",
    user,
    false  // Default duplicated at every call site
)

if (isEnabled) {
    showNewCheckout()
}
```

Problems:
- "new-checkout" string can be typo'd
- Default value `false` repeated everywhere
- Type mismatch if remote config changes type
- No way to know from code what flags exist
- `platform` and `minVersion` are string-based, error-prone

**Konditional approach:**
```kotlin
// Flag definition
enum class Features(override val key: String) : Conditional<Boolean, Context> {
    NEW_CHECKOUT("new_checkout"),
}

// Configuration (type-safe DSL)
config {
    Features.NEW_CHECKOUT with {
        default(false)

        rule {
            platforms(Platform.IOS)
            versions { min(2, 0) }
            rollout = Rollout.of(25.0)
        } implies true
    }
}

// Application code
if (context.evaluate(Features.NEW_CHECKOUT)) {
    showNewCheckout()
}
```

Benefits:
- `Features.NEW_CHECKOUT` is an enum—can't typo, IDE autocompletes, refactoring works
- Default value defined once
- Type is `Boolean`, guaranteed by the compiler
- All flags visible in the `Features` enum
- Platform and version are strongly-typed
- Rollout percentage is type-safe (`Rollout.of(25.0)` validates 0-100 range)

## Love hurts (Because Nothing Is Free)

Alright, I'll confess: this approach has costs.

**Cost 1: Flags must be defined in code.** You can't add new flags from a remote dashboard without deploying code. For some teams, this is a dealbreaker.

**Mitigation**: You can still change flag *configuration* (rules, rollout percentages, default values) remotely via serialization. You just can't add entirely new flags without a deploy.

**Cost 2: More upfront design.** String-based flags are easy to add: just pick a string and go. Type-safe flags require defining the enum, choosing the value type, possibly extending the context.

**Mitigation**: This is a feature, not a bug. The upfront design prevents future pain. And once you've done it a few times, it's quick.

**Cost 3: Less runtime flexibility.** You can't dynamically create flags based on runtime conditions (e.g., creating a flag per organization).

**Mitigation**: This is a genuine limitation. If you need extreme runtime flexibility, Konditional may not be the right fit. But most teams don't need this—they need reliable, type-safe configuration management.

**Cost 4: Learning curve.** Developers need to understand generic types, enums, and the DSL.

**Mitigation**: The type system guides you. If you try to do something wrong, you get a compile error with a clear message. This is better than runtime errors in production.

## Happily Ever After?

Konditional is built on a simple idea: **feature flags are functions from context to values, and functions have types**. By encoding these types in Kotlin's type system, we get compile-time safety, IDE support, and refactoring tools for free.

The implementation choices—generic parameters, wrapper types, atomic snapshots, SHA-256 bucketing—all stem from making the type system work for us. Each decision trades runtime flexibility for compile-time guarantees.

Is this always the right trade? No. But if you've ever been woken up at 3am because someone typo'd a feature flag name, or spent hours debugging why users are getting inconsistent experiences, you know the pain of stringly-typed systems.

Type-safe feature flags won't prevent all bugs. But they'll prevent entire **classes** of bugs, and they'll catch them at compile time instead of in production.

And in my experience, that's worth the cost.

---

## Further Reading

- **[Parse, Don't Validate](https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/)** by Alexis King - The essay that inspired Konditional's type safety approach
- **[Making Illegal States Unrepresentable](https://blog.janestreet.com/effective-ml-revisited/)** by Yaron Minsky - Jane Street's approach to designing with types
- **[Type Safety Back and Forth](https://www.parsonsmatt.org/2017/10/11/type_safety_back_and_forth.html)** by Matt Parsons - How to thread types through full-stack applications

[Konditional](https://github.com/amichne/konditional) is available under the [MIT License](https://opensource.org/licenses/MIT).

The architecture documentation ([`docs/architecture.md`](https://github.com/amichne/konditional/blob/3e67c1609e5b81f10956e3d87cb567db2513b5f1/docs/architecture.md)) provides deeper technical details on the implementation.

---
