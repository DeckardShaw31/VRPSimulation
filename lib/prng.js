// Minimal xorshift32 PRNG utility for tests
function xorshift32(seed){ let x = seed>>>0; if(x===0) x=2463534242; return function(){ x ^= x<<13; x >>>= 0; x ^= x>>>17; x ^= x<<5; x >>>= 0; return (x>>>0)/4294967296; } }
module.exports = { xorshift32 };
