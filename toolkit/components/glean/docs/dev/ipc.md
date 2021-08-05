# Inter-process Communication (IPC)

Firefox Desktop is a multi-process desktop application.
Code requiring instrumentation may be on any of its processes,
so FOG provide facilities to do just that.

## Design

The IPC Design of FOG was worked out in
[bug 1618253](https://bugzilla.mozilla.org/show_bug.cgi?id=1618253).

It centred around a few specific concepts:

### Forbidding Non-Commutative Operations

Because we cannot nicely impose a canonical ordering of metric operations across all processes,
FOG forbids non-[commutative](https://en.wikipedia.org/wiki/Commutative_property)
metric operations in some circumstances.

For example,
`Add()`-ing to a Counter metric works from multiple processes because the order doesn't matter.
However, given a String metric being `Set()` from multiple processes simultaneously,
which value should it take?

This ambiguity is not a good foundation to build trust on,
so we forbid setting a String metric from multiple processes.

#### List of Forbidden Operations

* Boolean's `set` (this is the metric type's only operation)
* Labeled Boolean's `set` (this is the metric type's only operation)
* String's `set` (this is the metric type's only operation)
* Labeled String's `set` (this is the metric type's only operation)
* String List's `set`
    * `add` is permitted (order and uniqueness are not guaranteed)
* Timespan's `start`, `stop`, and `cancel` (these are the metric type's only operations)
* UUID's `set` and `generateAndSet` (these are the metric type's only operations)
* Datetime's `set` (this is the metric type's only operation)
* Quantity's `set` (this is the metric type's only operation)

This list may grow over time as new metric types are added.
If there's an operation/metric type on this list that you need to use in a non-parent process,
please reach out
[on the #glean channel](https://chat.mozilla.org/#/room/#glean:mozilla.org)
and we'll help you out.

### Process Agnosticism

For metric types that can be used cross-process,
FOG provides no facility for identifying which process the instrumentation is on.

What this means is that if you accumulate to a
[Timing Distribution](https://mozilla.github.io/glean/book/user/metrics/timing_distribution.html)
in multiple processes,
all the samples from all the processes will be combined in the same metric.

If you wish to distinguish samples from different process types,
you will need multiple metrics and inline code to select the proper one for the given process.
For example:

```C++
if (XRE_GetProcessType() == GeckoProcessType_Default) {
  mozilla::glean::performance::cache_size.Accumulate(numBytes / 1024);
} else {
  mozilla::glean::performance::non_main_process_cache_size.Accumulate(numBytes / 1024);
}
```

### Scheduling

FOG makes no guarantee about when non-main-process metric values are sent across IPC.
FOG will try its best to schedule opportunistically in idle moments.

There are a few cases where we provide more firm guarantees:

#### Tests

There are test-only APIs in Rust, C++, and Javascript.
These do not await a flush of child process metric values.
You can use the test-only method `testFlushAllChildren` on the `FOG`
XPCOM component to await child data's arrival:
```js
let FOG = Cc["@mozilla.org/toolkit/glean;1"].createInstance(Ci.nsIFOG);
await FOG.testFlushAllChildren();
```
See [the test documentation](testing.md) for more details on testing.

#### Built-in Pings

[Built-in pings](https://mozilla.github.io/glean/book/user/pings/index.html)
will send only after all metric values from all child processes have been collected.

We cannot at this time provide the same guarantee for
[Custom Pings](https://mozilla.github.io/glean/book/user/pings/custom.html).

#### Shutdown

We will make a best effort during an orderly shutdown to flush all pending data in child processes.
This means a disorderly shutdown (usually a crash)
may result in child process data being lost.

### Mechanics

At present
(see [bug 1641989](https://bugzilla.mozilla.org/show_bug.cgi?id=1641989))
FOG uses messages on the PContent protocol.
This enables communication between content child processes and the parent process.

The rough design is that the Parent can request an immediate flush of pending data,
and each Child can decide to flush its pending data whenever it wishes.

Pending Data is a buffer of bytes generated by `bincode` in Rust in the Child,
handed off to C++, passed over IPC,
then given back to `bincode` in Rust on the Parent.

Rust is then responsible for turning the pending data into
[metric API](../user/api.md) calls on the metrics in the parent process.