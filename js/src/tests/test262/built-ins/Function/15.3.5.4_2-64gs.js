// Copyright (c) 2012 Ecma International.  All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
es5id: 15.3.5.4_2-64gs
description: >
    Strict mode - checking access to strict function caller from
    non-strict function (strict function declaration called by
    Function.prototype.apply(globalObject))
flags: [noStrict]
---*/

var global = this;

function f() {
  "use strict";
  gNonStrict();
};

assert.throws(TypeError, function() {
  f.apply(global);
});

function gNonStrict() {
  return gNonStrict.caller || gNonStrict.caller.throwTypeError;
}

reportCompare(0, 0);