/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/attention_fi.json`.
 */
export type AttentionFi = {
  "address": "8fQW2JbfNytdjJ7LR8dvKWMUtpeQPRqxAa3JZvBLsVVc",
  "metadata": {
    "name": "attentionFi",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "addToCollection",
      "docs": [
        "Move a Core asset the payer controls into one of their collections."
      ],
      "discriminator": [
        30,
        185,
        207,
        216,
        58,
        60,
        98,
        185
      ],
      "accounts": [
        {
          "name": "payer",
          "docs": [
            "Update authority of the asset and authority of the destination collection."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "asset",
          "writable": true
        },
        {
          "name": "currentCollection",
          "docs": [
            "mpl-core validates it against the asset's update authority."
          ],
          "writable": true,
          "optional": true
        },
        {
          "name": "newCollection",
          "docs": [
            "payer's authority over it."
          ],
          "writable": true
        },
        {
          "name": "mplCoreProgram",
          "address": "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "bid",
      "docs": [
        "Bid on a Dutch auction at the current descending price (price-capped)."
      ],
      "discriminator": [
        199,
        56,
        85,
        38,
        146,
        243,
        37,
        158
      ],
      "accounts": [
        {
          "name": "bidder",
          "writable": true,
          "signer": true
        },
        {
          "name": "global",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "treasury",
          "writable": true
        },
        {
          "name": "auction",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  117,
                  99,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "mint",
          "relations": [
            "auction"
          ]
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "auction"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "bidderTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "bidder"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "disavowal",
          "docs": [
            "Set when the token's subject has disowned it.",
            "",
            "Only the buy side carries this. Selling and claiming must keep working",
            "on a disowned token — freezing exits would make holders pay for somebody",
            "else's misrepresentation.",
            "",
            "\"not disavowed\"."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  105,
                  115,
                  97,
                  118,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "guardians",
          "docs": [
            "The emergency stop.",
            "",
            "Required, never optional: an optional stop is not a stop — omitting it",
            "would help the caller, which is exactly the shape that made the genesis",
            "pool exploitable. Unchecked because an empty account is the legitimate",
            "\"no guardian set installed yet\" state rather than an error.",
            ""
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  117,
                  97,
                  114,
                  100,
                  105,
                  97,
                  110,
                  115
                ]
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        },
        {
          "name": "maxPricePerToken",
          "type": "u64"
        }
      ]
    },
    {
      "name": "burnCollection",
      "docs": [
        "Delete an empty collection and reclaim its rent. Core rejects this while",
        "it still holds assets."
      ],
      "discriminator": [
        229,
        178,
        26,
        169,
        246,
        141,
        86,
        26
      ],
      "accounts": [
        {
          "name": "authority",
          "docs": [
            "Authority over the collection, and where its rent is returned."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "collection",
          "docs": [
            "that it holds no assets."
          ],
          "writable": true
        },
        {
          "name": "mplCoreProgram",
          "address": "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "burnNft",
      "docs": [
        "Burn a Core asset the caller owns, reclaiming its rent. Core rejects",
        "frozen assets, so soulbound credentials can't be destroyed this way."
      ],
      "discriminator": [
        119,
        13,
        183,
        17,
        194,
        243,
        38,
        31
      ],
      "accounts": [
        {
          "name": "owner",
          "docs": [
            "Owner of the asset, and the account rent is returned to."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "asset",
          "writable": true
        },
        {
          "name": "collection",
          "docs": [
            "has one — Core decrements the collection's size as part of the burn."
          ],
          "writable": true,
          "optional": true
        },
        {
          "name": "mplCoreProgram",
          "address": "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "buy",
      "docs": [
        "Buy tokens along the curve with SOL (slippage-guarded)."
      ],
      "discriminator": [
        102,
        6,
        61,
        18,
        1,
        218,
        235,
        234
      ],
      "accounts": [
        {
          "name": "buyer",
          "writable": true,
          "signer": true
        },
        {
          "name": "global",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "treasury",
          "writable": true
        },
        {
          "name": "curve",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  117,
                  114,
                  118,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "mint",
          "relations": [
            "curve"
          ]
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "curve"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "buyerTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "buyer"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "perk",
          "docs": [
            "Optional perk NFT owned by the buyer; grants a trading-fee discount.",
            "Constrained to a perk PDA owned by the buyer when supplied."
          ],
          "optional": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  101,
                  114,
                  107
                ]
              },
              {
                "kind": "account",
                "path": "perk.asset",
                "account": "perkNft"
              }
            ]
          }
        },
        {
          "name": "traderStats",
          "docs": [
            "Optional cumulative-activity record for the buyer, credited with this",
            "trade's SOL. Optional for the reason set out in `perks::record_activity`:",
            "leaving it out forfeits progress toward your own fee discount and costs",
            "nobody else anything. A TS caller still has to name it",
            "(`traderStats: null`), as it already does for `perk`."
          ],
          "writable": true,
          "optional": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  97,
                  100,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "buyer"
              }
            ]
          }
        },
        {
          "name": "genesisPool",
          "docs": [
            "The token's genesis fee pool.",
            "",
            "Required, and unchecked because it may legitimately not exist: most",
            "tokens never issue genesis NFTs. Whether it exists is read from the",
            "chain below rather than inferred from whether the caller bothered to",
            "pass it. As an `Option` this was a hole — omitting it made",
            "`total_share_bps` read as zero, so the whole creator fee accrued to the",
            "creator and the holders who had paid for a share of that stream were",
            "simply skipped. It cost the trader nothing to omit, and the creator was",
            "the one who gained.",
            "",
            "account; the handler validates the contents before trusting them."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  101,
                  110,
                  112,
                  111,
                  111,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "disavowal",
          "docs": [
            "Set when the token's subject has disowned it.",
            "",
            "Only the buy side carries this. Selling and claiming must keep working",
            "on a disowned token — freezing exits would make holders pay for somebody",
            "else's misrepresentation.",
            "",
            "\"not disavowed\"."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  105,
                  115,
                  97,
                  118,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "guardians",
          "docs": [
            "The emergency stop.",
            "",
            "Required, never optional: an optional stop is not a stop — omitting it",
            "would help the caller, which is exactly the shape that made the genesis",
            "pool exploitable. Unchecked because an empty account is the legitimate",
            "\"no guardian set installed yet\" state rather than an error.",
            ""
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  117,
                  97,
                  114,
                  100,
                  105,
                  97,
                  110,
                  115
                ]
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        }
      ],
      "args": [
        {
          "name": "solAmount",
          "type": "u64"
        },
        {
          "name": "minTokensOut",
          "type": "u64"
        }
      ]
    },
    {
      "name": "buyCollection",
      "docs": [
        "Buy a listed collection at its current descending price."
      ],
      "discriminator": [
        235,
        40,
        193,
        248,
        131,
        68,
        255,
        72
      ],
      "accounts": [
        {
          "name": "buyer",
          "writable": true,
          "signer": true
        },
        {
          "name": "global",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "feeConfig",
          "docs": [
            "The NFT market's own fee, which is not the curve's trading fee."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  102,
                  101,
                  101,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "treasury",
          "writable": true
        },
        {
          "name": "creator",
          "writable": true
        },
        {
          "name": "auction",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  108,
                  97,
                  117,
                  99,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "collection"
              }
            ]
          }
        },
        {
          "name": "collection",
          "writable": true,
          "relations": [
            "auction"
          ]
        },
        {
          "name": "mplCoreProgram",
          "address": "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d"
        },
        {
          "name": "guardians",
          "docs": [
            "The emergency stop.",
            "",
            "Required, never optional: an optional stop is not a stop — omitting it",
            "would help the caller, which is exactly the shape that made the genesis",
            "pool exploitable. Unchecked because an empty account is the legitimate",
            "\"no guardian set installed yet\" state rather than an error.",
            ""
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  117,
                  97,
                  114,
                  100,
                  105,
                  97,
                  110,
                  115
                ]
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "maxTotal",
          "type": "u64"
        }
      ]
    },
    {
      "name": "buyConviction",
      "docs": [
        "Buy on a conviction curve; re-locks the holder's position."
      ],
      "discriminator": [
        145,
        223,
        244,
        241,
        136,
        41,
        131,
        243
      ],
      "accounts": [
        {
          "name": "buyer",
          "writable": true,
          "signer": true
        },
        {
          "name": "global",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "treasury",
          "writable": true
        },
        {
          "name": "traderStats",
          "docs": [
            "Optional cumulative-activity record for the buyer. Capital committed",
            "here counts as a *deposit* rather than volume — `activity_score` weights",
            "deposits double, because locking money up is a stronger signal than a",
            "trade that can be reversed in the next block."
          ],
          "writable": true,
          "optional": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  97,
                  100,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "buyer"
              }
            ]
          }
        },
        {
          "name": "curve",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  118,
                  105,
                  99,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "mint",
          "relations": [
            "curve"
          ]
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "curve"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "buyerTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "buyer"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "position",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              },
              {
                "kind": "account",
                "path": "buyer"
              }
            ]
          }
        },
        {
          "name": "disavowal",
          "docs": [
            "Set when the token's subject has disowned it.",
            "",
            "Only the buy side carries this. Selling and claiming must keep working",
            "on a disowned token — freezing exits would make holders pay for somebody",
            "else's misrepresentation.",
            "",
            "\"not disavowed\"."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  105,
                  115,
                  97,
                  118,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "guardians",
          "docs": [
            "The emergency stop.",
            "",
            "Required, never optional: an optional stop is not a stop — omitting it",
            "would help the caller, which is exactly the shape that made the genesis",
            "pool exploitable. Unchecked because an empty account is the legitimate",
            "\"no guardian set installed yet\" state rather than an error.",
            ""
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  117,
                  97,
                  114,
                  100,
                  105,
                  97,
                  110,
                  115
                ]
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        }
      ],
      "args": [
        {
          "name": "solAmount",
          "type": "u64"
        },
        {
          "name": "minTokensOut",
          "type": "u64"
        }
      ]
    },
    {
      "name": "buyGenesisUnit",
      "docs": [
        "Buy one unit from a token's genesis group at the listed price, subject",
        "to the group's per-wallet cap."
      ],
      "discriminator": [
        215,
        123,
        178,
        252,
        228,
        149,
        190,
        38
      ],
      "accounts": [
        {
          "name": "buyer",
          "writable": true,
          "signer": true
        },
        {
          "name": "global",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "feeConfig",
          "docs": [
            "A genesis unit is an NFT sale, so it is charged the NFT market's fee."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  102,
                  101,
                  101,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "treasury",
          "writable": true
        },
        {
          "name": "creator",
          "writable": true
        },
        {
          "name": "subjectMint",
          "relations": [
            "group"
          ]
        },
        {
          "name": "group",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  101,
                  110,
                  103,
                  114,
                  111,
                  117,
                  112
                ]
              },
              {
                "kind": "account",
                "path": "subjectMint"
              }
            ]
          }
        },
        {
          "name": "collection",
          "writable": true,
          "relations": [
            "group"
          ]
        },
        {
          "name": "asset",
          "docs": [
            "group's escrow and a member of its collection."
          ],
          "writable": true
        },
        {
          "name": "genesis",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  101,
                  110,
                  101,
                  115,
                  105,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "asset"
              }
            ]
          }
        },
        {
          "name": "pool",
          "docs": [
            "Created by `list_genesis_group`, so it always exists by the time a unit",
            "can be bought."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  101,
                  110,
                  112,
                  111,
                  111,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "subjectMint"
              }
            ]
          }
        },
        {
          "name": "allocation",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  101,
                  110,
                  97,
                  108,
                  108,
                  111,
                  99
                ]
              },
              {
                "kind": "account",
                "path": "subjectMint"
              },
              {
                "kind": "account",
                "path": "buyer"
              }
            ]
          }
        },
        {
          "name": "mplCoreProgram",
          "address": "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d"
        },
        {
          "name": "guardians",
          "docs": [
            "The emergency stop.",
            "",
            "Required, never optional: an optional stop is not a stop — omitting it",
            "would help the caller, which is exactly the shape that made the genesis",
            "pool exploitable. Unchecked because an empty account is the legitimate",
            "\"no guardian set installed yet\" state rather than an error.",
            ""
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  117,
                  97,
                  114,
                  100,
                  105,
                  97,
                  110,
                  115
                ]
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "maxTotal",
          "type": "u64"
        }
      ]
    },
    {
      "name": "buyNft",
      "docs": [
        "Buy the 1-of-1 NFT at the current descending price; transfers it to the buyer."
      ],
      "discriminator": [
        96,
        0,
        28,
        190,
        49,
        107,
        83,
        222
      ],
      "accounts": [
        {
          "name": "buyer",
          "writable": true,
          "signer": true
        },
        {
          "name": "global",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "feeConfig",
          "docs": [
            "The NFT market's own fee, which is not the curve's trading fee."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  102,
                  101,
                  101,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "treasury",
          "writable": true
        },
        {
          "name": "creator",
          "writable": true
        },
        {
          "name": "auction",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  110,
                  102,
                  116,
                  97,
                  117,
                  99,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "asset"
              }
            ]
          }
        },
        {
          "name": "asset",
          "writable": true,
          "relations": [
            "auction"
          ]
        },
        {
          "name": "mplCoreProgram",
          "address": "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d"
        },
        {
          "name": "guardians",
          "docs": [
            "The emergency stop.",
            "",
            "Required, never optional: an optional stop is not a stop — omitting it",
            "would help the caller, which is exactly the shape that made the genesis",
            "pool exploitable. Unchecked because an empty account is the legitimate",
            "\"no guardian set installed yet\" state rather than an error.",
            ""
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  117,
                  97,
                  114,
                  100,
                  105,
                  97,
                  110,
                  115
                ]
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "maxTotal",
          "type": "u64"
        }
      ]
    },
    {
      "name": "buyRevenue",
      "docs": [
        "Buy revenue shares at the fixed launch price; auto-stakes for revenue."
      ],
      "discriminator": [
        137,
        228,
        11,
        225,
        206,
        74,
        74,
        70
      ],
      "accounts": [
        {
          "name": "buyer",
          "writable": true,
          "signer": true
        },
        {
          "name": "global",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "treasury",
          "docs": [
            "purchase payment + fee (creator-raise routing is a later refinement)."
          ],
          "writable": true
        },
        {
          "name": "traderStats",
          "docs": [
            "Optional cumulative-activity record for the buyer. Capital committed",
            "here counts as a *deposit* rather than volume — `activity_score` weights",
            "deposits double, because locking money up is a stronger signal than a",
            "trade that can be reversed in the next block."
          ],
          "writable": true,
          "optional": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  97,
                  100,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "buyer"
              }
            ]
          }
        },
        {
          "name": "revenue",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  118,
                  101,
                  110,
                  117,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "mint",
          "relations": [
            "revenue"
          ]
        },
        {
          "name": "position",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  118,
                  115,
                  116,
                  97,
                  107,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              },
              {
                "kind": "account",
                "path": "buyer"
              }
            ]
          }
        },
        {
          "name": "disavowal",
          "docs": [
            "Set when the token's subject has disowned it.",
            "",
            "Only the buy side carries this. Selling and claiming must keep working",
            "on a disowned token — freezing exits would make holders pay for somebody",
            "else's misrepresentation.",
            "",
            "\"not disavowed\"."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  105,
                  115,
                  97,
                  118,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "guardians",
          "docs": [
            "The emergency stop.",
            "",
            "Required, never optional: an optional stop is not a stop — omitting it",
            "would help the caller, which is exactly the shape that made the genesis",
            "pool exploitable. Unchecked because an empty account is the legitimate",
            "\"no guardian set installed yet\" state rather than an error.",
            ""
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  117,
                  97,
                  114,
                  100,
                  105,
                  97,
                  110,
                  115
                ]
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "claimCreatorFee",
      "docs": [
        "Claim a token's accrued creator fees — gated on the creator being",
        "SAS-verified (they must hold a `Verification` record)."
      ],
      "discriminator": [
        26,
        97,
        138,
        203,
        132,
        171,
        141,
        252
      ],
      "accounts": [
        {
          "name": "creator",
          "writable": true,
          "signer": true,
          "relations": [
            "curve"
          ]
        },
        {
          "name": "mint",
          "relations": [
            "curve"
          ]
        },
        {
          "name": "curve",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  117,
                  114,
                  118,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "verification",
          "docs": [
            "The creator's SAS verification record. Its existence at this PDA gates the",
            "claim — an unverified creator cannot construct a valid transaction, which",
            "is exactly the brief's \"claimable by the X account owner once they verify\"."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  101,
                  114,
                  105,
                  102,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "creator"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "claimEarnedPerk",
      "docs": [
        "Mint your own perk once your trading clears the first activity",
        "threshold, at the level that activity has already earned. No grant, no",
        "authority signature."
      ],
      "discriminator": [
        185,
        83,
        225,
        105,
        211,
        193,
        105,
        144
      ],
      "accounts": [
        {
          "name": "recipient",
          "docs": [
            "The trader claiming their own perk. Signs and funds the asset."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "stats",
          "docs": [
            "Cumulative activity, and the whole basis for the claim. Pinned by seeds",
            "to the signer, so a wallet can't present someone else's volume."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  97,
                  100,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "recipient"
              }
            ]
          }
        },
        {
          "name": "perkAuthority",
          "docs": [
            "program can level the NFT up later. Validated by seeds."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  101,
                  114,
                  107,
                  97,
                  117,
                  116,
                  104
                ]
              }
            ]
          }
        },
        {
          "name": "perk",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  101,
                  114,
                  107
                ]
              },
              {
                "kind": "account",
                "path": "asset"
              }
            ]
          }
        },
        {
          "name": "asset",
          "docs": [
            "The new Core asset (client-generated keypair, signs its creation)."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "mplCoreProgram",
          "address": "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "uri",
          "type": "string"
        }
      ]
    },
    {
      "name": "claimGenesisFee",
      "docs": [
        "Claim a genesis NFT holder's accrued share of the token's fees."
      ],
      "discriminator": [
        157,
        70,
        61,
        169,
        196,
        215,
        221,
        102
      ],
      "accounts": [
        {
          "name": "holder",
          "writable": true,
          "signer": true
        },
        {
          "name": "pool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  101,
                  110,
                  112,
                  111,
                  111,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "genesis.subject_mint",
                "account": "genesisNft"
              }
            ]
          }
        },
        {
          "name": "genesis",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  101,
                  110,
                  101,
                  115,
                  105,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "genesis.asset",
                "account": "genesisNft"
              }
            ]
          }
        },
        {
          "name": "asset",
          "docs": [
            "`has_one = asset`, and read below to find who owns it now."
          ],
          "relations": [
            "genesis"
          ]
        }
      ],
      "args": []
    },
    {
      "name": "claimPerk",
      "docs": [
        "Claim a perk the protocol authorised via `grant_perk`. The claimant",
        "signs and funds the mint; the grant is consumed so it can't be replayed."
      ],
      "discriminator": [
        177,
        211,
        55,
        37,
        254,
        158,
        206,
        245
      ],
      "accounts": [
        {
          "name": "recipient",
          "docs": [
            "The granted wallet. Signs and funds its own asset."
          ],
          "writable": true,
          "signer": true,
          "relations": [
            "grant"
          ]
        },
        {
          "name": "grant",
          "docs": [
            "The authorisation, consumed by this claim. `has_one = recipient` binds",
            "it to the signer, so one wallet can't spend another's grant."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  101,
                  114,
                  107,
                  103,
                  114,
                  97,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "recipient"
              }
            ]
          }
        },
        {
          "name": "granter",
          "docs": [
            "that actually paid to create it."
          ],
          "writable": true
        },
        {
          "name": "perkAuthority",
          "docs": [
            "program can level the NFT up later. Validated by seeds."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  101,
                  114,
                  107,
                  97,
                  117,
                  116,
                  104
                ]
              }
            ]
          }
        },
        {
          "name": "perk",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  101,
                  114,
                  107
                ]
              },
              {
                "kind": "account",
                "path": "asset"
              }
            ]
          }
        },
        {
          "name": "asset",
          "docs": [
            "The new Core asset (client-generated keypair, signs its creation)."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "mplCoreProgram",
          "address": "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "uri",
          "type": "string"
        }
      ]
    },
    {
      "name": "claimRevenue",
      "docs": [
        "Claim a shareholder's accrued revenue."
      ],
      "discriminator": [
        4,
        22,
        151,
        70,
        183,
        79,
        73,
        189
      ],
      "accounts": [
        {
          "name": "holder",
          "writable": true,
          "signer": true
        },
        {
          "name": "revenue",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  118,
                  101,
                  110,
                  117,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "mint",
          "relations": [
            "revenue",
            "position"
          ]
        },
        {
          "name": "position",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  118,
                  115,
                  116,
                  97,
                  107,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              },
              {
                "kind": "account",
                "path": "holder"
              }
            ]
          }
        },
        {
          "name": "owner",
          "relations": [
            "position"
          ]
        }
      ],
      "args": []
    },
    {
      "name": "closeGenesisGroup",
      "docs": [
        "Delist a genesis group, returning the collection's update authority and",
        "the group's rent to its creator. Requires an empty escrow."
      ],
      "discriminator": [
        98,
        142,
        48,
        163,
        27,
        128,
        232,
        121
      ],
      "accounts": [
        {
          "name": "creator",
          "docs": [
            "The group's creator; receives the collection authority and the rent."
          ],
          "writable": true,
          "signer": true,
          "relations": [
            "group"
          ]
        },
        {
          "name": "subjectMint",
          "relations": [
            "group"
          ]
        },
        {
          "name": "group",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  101,
                  110,
                  103,
                  114,
                  111,
                  117,
                  112
                ]
              },
              {
                "kind": "account",
                "path": "subjectMint"
              }
            ]
          }
        },
        {
          "name": "collection",
          "writable": true,
          "relations": [
            "group"
          ]
        },
        {
          "name": "mplCoreProgram",
          "address": "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "createCollection",
      "docs": [
        "Create a Core collection whose update authority stays with the payer."
      ],
      "discriminator": [
        156,
        251,
        92,
        54,
        233,
        2,
        16,
        82
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "collection",
          "docs": [
            "The new Core collection (client-generated keypair, signs its creation)."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "mplCoreProgram",
          "address": "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "name",
          "type": "string"
        },
        {
          "name": "uri",
          "type": "string"
        }
      ]
    },
    {
      "name": "depositGenesisFee",
      "docs": [
        "Route a token's fees to its genesis NFT holders (split pro-rata by share)."
      ],
      "discriminator": [
        145,
        160,
        170,
        166,
        54,
        48,
        173,
        128
      ],
      "accounts": [
        {
          "name": "depositor",
          "writable": true,
          "signer": true
        },
        {
          "name": "pool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  101,
                  110,
                  112,
                  111,
                  111,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "subjectMint"
              }
            ]
          }
        },
        {
          "name": "subjectMint"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "depositRevenue",
      "docs": [
        "Deposit revenue to be split pro-rata across current shareholders."
      ],
      "discriminator": [
        224,
        212,
        82,
        100,
        60,
        240,
        220,
        29
      ],
      "accounts": [
        {
          "name": "depositor",
          "writable": true,
          "signer": true
        },
        {
          "name": "revenue",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  118,
                  101,
                  110,
                  117,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "mint",
          "relations": [
            "revenue"
          ]
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "disavowToken",
      "docs": [
        "Mark a token as disowned by the person it names. Authority or any one",
        "guardian. Buying stops; selling and claiming stay open, because trapping",
        "holders in an asset they now want out of makes them pay for someone",
        "else's misrepresentation."
      ],
      "discriminator": [
        245,
        142,
        213,
        74,
        179,
        142,
        133,
        136
      ],
      "accounts": [
        {
          "name": "signer",
          "writable": true,
          "signer": true
        },
        {
          "name": "global",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "guardians",
          "docs": [
            "The guardian set, so a guardian can act without the authority's key.",
            "",
            "tolerates it being absent, which is the state before `set_guardians`."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  117,
                  97,
                  114,
                  100,
                  105,
                  97,
                  110,
                  115
                ]
              }
            ]
          }
        },
        {
          "name": "mint"
        },
        {
          "name": "disavowal",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  105,
                  115,
                  97,
                  118,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "reason",
          "type": {
            "defined": {
              "name": "disavowReason"
            }
          }
        }
      ]
    },
    {
      "name": "graduate",
      "docs": [
        "Migrate a graduated curve's liquidity into a native AMM pool (permissionless)."
      ],
      "discriminator": [
        45,
        235,
        225,
        181,
        17,
        218,
        64,
        130
      ],
      "accounts": [
        {
          "name": "payer",
          "docs": [
            "Permissionless: anyone can trigger migration once the curve is complete."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "global",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "curve",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  117,
                  114,
                  118,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "mint",
          "relations": [
            "curve"
          ]
        },
        {
          "name": "curveVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "curve"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "pool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  109,
                  109
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "poolVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "pool"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "guardians",
          "docs": [
            "The emergency stop.",
            "",
            "Required, never optional: an optional stop is not a stop — omitting it",
            "would help the caller, which is exactly the shape that made the genesis",
            "pool exploitable. Unchecked because an empty account is the legitimate",
            "\"no guardian set installed yet\" state rather than an error.",
            ""
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  117,
                  97,
                  114,
                  100,
                  105,
                  97,
                  110,
                  115
                ]
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "rent",
          "address": "SysvarRent111111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "grantPerk",
      "docs": [
        "Authorise a wallet to claim a perk NFT, without minting it. Lets the",
        "protocol approve a batch of task completions cheaply — each recipient",
        "pays for their own asset via `claim_perk`."
      ],
      "discriminator": [
        132,
        103,
        163,
        32,
        164,
        190,
        39,
        81
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "global",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "recipient",
          "docs": [
            "is that the protocol grants ahead of the recipient showing up."
          ]
        },
        {
          "name": "grant",
          "docs": [
            "One outstanding grant per recipient: `init` fails if they already have",
            "an unclaimed one, so a double-grant can't mint two perks."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  101,
                  114,
                  107,
                  103,
                  114,
                  97,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "recipient"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "level",
          "type": "u8"
        }
      ]
    },
    {
      "name": "initialize",
      "docs": [
        "Create the one-time protocol config (fees, treasury, curve defaults)."
      ],
      "discriminator": [
        175,
        175,
        109,
        31,
        13,
        152,
        155,
        237
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "global",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "feeConfig",
          "docs": [
            "The NFT market's fee schedule. Created here so a new deployment is",
            "complete in one call; a protocol deployed before this account existed",
            "gets one from `set_fee_config` instead."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  102,
                  101,
                  101,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "treasury",
          "docs": [
            "never be routed into a program-controlled account."
          ]
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "launchConviction",
      "docs": [
        "Launch a token on a conviction curve: constant-product pricing plus a",
        "loyalty time-lock and early-exit penalty (for niche/community verticals)."
      ],
      "discriminator": [
        5,
        42,
        198,
        254,
        233,
        102,
        62,
        215
      ],
      "accounts": [
        {
          "name": "creator",
          "writable": true,
          "signer": true
        },
        {
          "name": "global",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "mint",
          "writable": true,
          "signer": true
        },
        {
          "name": "curve",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  118,
                  105,
                  99,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "curve"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "metadata",
          "docs": [
            "handler and validated by the Token Metadata program against `mint`."
          ],
          "writable": true
        },
        {
          "name": "tokenMetadataProgram",
          "address": "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
        },
        {
          "name": "launchPolicy",
          "docs": [
            "The launch policy — how many launches a wallet gets per window.",
            "",
            "what keeps a fresh deployment bounded rather than unlimited."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  97,
                  117,
                  110,
                  99,
                  104,
                  112,
                  111,
                  108,
                  105,
                  99,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "launchQuota",
          "docs": [
            "This creator's recent launches. Created on their first one, paid for by",
            "them — the rate limit costs the protocol nothing to enforce."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  97,
                  117,
                  110,
                  99,
                  104,
                  113,
                  117,
                  111,
                  116,
                  97
                ]
              },
              {
                "kind": "account",
                "path": "creator"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "rent",
          "address": "SysvarRent111111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "tier",
          "type": {
            "defined": {
              "name": "mindshareTier"
            }
          }
        },
        {
          "name": "lockPeriod",
          "type": "i64"
        },
        {
          "name": "earlyExitPenaltyBps",
          "type": "u16"
        },
        {
          "name": "metadata",
          "type": {
            "defined": {
              "name": "tokenMetadataArgs"
            }
          }
        }
      ]
    },
    {
      "name": "launchFromFeed",
      "docs": [
        "Launch a bonding-curve token seeded from a Switchboard mindshare feed",
        "(decentralized oracle) instead of a trusted keeper tier argument."
      ],
      "discriminator": [
        214,
        230,
        113,
        141,
        227,
        126,
        127,
        224
      ],
      "accounts": [
        {
          "name": "creator",
          "writable": true,
          "signer": true
        },
        {
          "name": "global",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "feed",
          "docs": [
            "Switchboard program) is checked in the handler, then parsed +",
            "staleness-validated — a single `owner =` constraint can't accept either",
            "cluster's program id."
          ]
        },
        {
          "name": "mint",
          "writable": true,
          "signer": true
        },
        {
          "name": "curve",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  117,
                  114,
                  118,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "curve"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "metadata",
          "docs": [
            "handler and validated by the Token Metadata program against `mint`."
          ],
          "writable": true
        },
        {
          "name": "tokenMetadataProgram",
          "address": "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
        },
        {
          "name": "launchPolicy",
          "docs": [
            "The launch policy — how many launches a wallet gets per window.",
            "",
            "what keeps a fresh deployment bounded rather than unlimited."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  97,
                  117,
                  110,
                  99,
                  104,
                  112,
                  111,
                  108,
                  105,
                  99,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "launchQuota",
          "docs": [
            "This creator's recent launches. Created on their first one, paid for by",
            "them — the rate limit costs the protocol nothing to enforce."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  97,
                  117,
                  110,
                  99,
                  104,
                  113,
                  117,
                  111,
                  116,
                  97
                ]
              },
              {
                "kind": "account",
                "path": "creator"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "rent",
          "address": "SysvarRent111111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "metadata",
          "type": {
            "defined": {
              "name": "tokenMetadataArgs"
            }
          }
        }
      ]
    },
    {
      "name": "launchRevenue",
      "docs": [
        "Launch a revenue-share token: shares are a pro-rata claim on deposited",
        "revenue (the creator-economy mechanism)."
      ],
      "discriminator": [
        30,
        48,
        139,
        108,
        95,
        41,
        134,
        227
      ],
      "accounts": [
        {
          "name": "creator",
          "writable": true,
          "signer": true
        },
        {
          "name": "global",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "mint",
          "writable": true,
          "signer": true
        },
        {
          "name": "revenue",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  118,
                  101,
                  110,
                  117,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "revenue"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "metadata",
          "docs": [
            "handler and validated by the Token Metadata program against `mint`."
          ],
          "writable": true
        },
        {
          "name": "tokenMetadataProgram",
          "address": "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
        },
        {
          "name": "launchPolicy",
          "docs": [
            "The launch policy — how many launches a wallet gets per window.",
            "",
            "what keeps a fresh deployment bounded rather than unlimited."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  97,
                  117,
                  110,
                  99,
                  104,
                  112,
                  111,
                  108,
                  105,
                  99,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "launchQuota",
          "docs": [
            "This creator's recent launches. Created on their first one, paid for by",
            "them — the rate limit costs the protocol nothing to enforce."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  97,
                  117,
                  110,
                  99,
                  104,
                  113,
                  117,
                  111,
                  116,
                  97
                ]
              },
              {
                "kind": "account",
                "path": "creator"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "rent",
          "address": "SysvarRent111111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "tier",
          "type": {
            "defined": {
              "name": "mindshareTier"
            }
          }
        },
        {
          "name": "sharePrice",
          "type": "u64"
        },
        {
          "name": "metadata",
          "type": {
            "defined": {
              "name": "tokenMetadataArgs"
            }
          }
        }
      ]
    },
    {
      "name": "launchToken",
      "docs": [
        "Launch a new token: mint the supply into a curve-owned vault and seed the",
        "bonding curve's starting price from the subject's mindshare tier."
      ],
      "discriminator": [
        10,
        128,
        86,
        171,
        3,
        137,
        161,
        244
      ],
      "accounts": [
        {
          "name": "creator",
          "writable": true,
          "signer": true
        },
        {
          "name": "global",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "mint",
          "docs": [
            "New SPL mint for the token (client-generated keypair, signs creation)."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "curve",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  117,
                  114,
                  118,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "vault",
          "docs": [
            "Curve-owned vault that holds the full token supply for sale."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "curve"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "metadata",
          "docs": [
            "validated by the Token Metadata program against `mint`."
          ],
          "writable": true
        },
        {
          "name": "tokenMetadataProgram",
          "address": "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
        },
        {
          "name": "launchPolicy",
          "docs": [
            "The launch policy — how many launches a wallet gets per window.",
            "",
            "what keeps a fresh deployment bounded rather than unlimited."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  97,
                  117,
                  110,
                  99,
                  104,
                  112,
                  111,
                  108,
                  105,
                  99,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "launchQuota",
          "docs": [
            "This creator's recent launches. Created on their first one, paid for by",
            "them — the rate limit costs the protocol nothing to enforce."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  97,
                  117,
                  110,
                  99,
                  104,
                  113,
                  117,
                  111,
                  116,
                  97
                ]
              },
              {
                "kind": "account",
                "path": "creator"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "rent",
          "address": "SysvarRent111111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "tier",
          "type": {
            "defined": {
              "name": "mindshareTier"
            }
          }
        },
        {
          "name": "metadata",
          "type": {
            "defined": {
              "name": "tokenMetadataArgs"
            }
          }
        }
      ]
    },
    {
      "name": "levelUp",
      "docs": [
        "Level up a perk NFT: rewrites its on-chain Attributes and raises its fee",
        "discount (program-controlled via the perk authority PDA). Signed by the",
        "holder and gated on their own cumulative activity, not by the authority."
      ],
      "discriminator": [
        128,
        64,
        197,
        116,
        226,
        129,
        119,
        234
      ],
      "accounts": [
        {
          "name": "owner",
          "docs": [
            "The perk's owner. Signs for their own level-up and pays for it."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "stats",
          "docs": [
            "The owner's cumulative trading activity — the whole basis for the",
            "level-up. Pinned by seeds to the signer, so one wallet cannot present",
            "another's volume."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  97,
                  100,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "perkAuthority",
          "docs": [
            "update via seeds. Validated by seeds."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  101,
                  114,
                  107,
                  97,
                  117,
                  116,
                  104
                ]
              }
            ]
          }
        },
        {
          "name": "perk",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  101,
                  114,
                  107
                ]
              },
              {
                "kind": "account",
                "path": "asset"
              }
            ]
          }
        },
        {
          "name": "asset",
          "writable": true,
          "relations": [
            "perk"
          ]
        },
        {
          "name": "mplCoreProgram",
          "address": "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "listCollectionAuction",
      "docs": [
        "List a whole mpl-core collection as a descending auction.",
        "",
        "Sells the collection's update authority — the only thing a collection",
        "has to give — which carries every member with it."
      ],
      "discriminator": [
        122,
        243,
        247,
        200,
        107,
        233,
        114,
        102
      ],
      "accounts": [
        {
          "name": "creator",
          "docs": [
            "Current update authority of the collection; must sign to hand it over."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "global",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "auction",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  108,
                  97,
                  117,
                  99,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "collection"
              }
            ]
          }
        },
        {
          "name": "collection",
          "docs": [
            "change unless `creator` is the current update authority, which is the",
            "same guarantee a constraint here would give without decoding Core's",
            "layout."
          ],
          "writable": true
        },
        {
          "name": "mplCoreProgram",
          "address": "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "startPrice",
          "type": "u64"
        },
        {
          "name": "floorPrice",
          "type": "u64"
        },
        {
          "name": "duration",
          "type": "i64"
        }
      ]
    },
    {
      "name": "listGenesisGroup",
      "docs": [
        "Open a fixed-price run of genesis fee-share NFTs for a token, escrowing",
        "the collection's update authority so the declared size is binding."
      ],
      "discriminator": [
        192,
        107,
        126,
        114,
        121,
        152,
        38,
        201
      ],
      "accounts": [
        {
          "name": "creator",
          "docs": [
            "The subject token's creator — the only wallet that can sell a claim on",
            "its fee stream."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "subjectMint"
        },
        {
          "name": "curve",
          "docs": [
            "The subject token's bonding curve — gates issuance to its creator."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  117,
                  114,
                  118,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "subjectMint"
              }
            ]
          }
        },
        {
          "name": "group",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  101,
                  110,
                  103,
                  114,
                  111,
                  117,
                  112
                ]
              },
              {
                "kind": "account",
                "path": "subjectMint"
              }
            ]
          }
        },
        {
          "name": "pool",
          "docs": [
            "Created here if the token has never issued a genesis NFT, so the group",
            "can be checked against — and later credited to — the same pool one-off",
            "`mint_genesis` NFTs use. A token has one fee stream, not one per",
            "issuance route."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  101,
                  110,
                  112,
                  111,
                  111,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "subjectMint"
              }
            ]
          }
        },
        {
          "name": "collection",
          "docs": [
            "change unless `creator` is its current update authority, which is the",
            "same guarantee a constraint here would give without decoding Core's",
            "layout."
          ],
          "writable": true
        },
        {
          "name": "mplCoreProgram",
          "address": "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "totalUnits",
          "type": "u16"
        },
        {
          "name": "shareBps",
          "type": "u16"
        },
        {
          "name": "price",
          "type": "u64"
        },
        {
          "name": "perWalletCap",
          "type": "u16"
        }
      ]
    },
    {
      "name": "listNftAuction",
      "docs": [
        "List an NFT the caller already owns as a descending 1-of-1 auction.",
        "`start_nft_auction` mints its asset, so it can only list something",
        "created in the same transaction; this escrows an existing one."
      ],
      "discriminator": [
        255,
        215,
        240,
        168,
        197,
        68,
        106,
        71
      ],
      "accounts": [
        {
          "name": "creator",
          "docs": [
            "Current owner of the asset; must sign to hand it into escrow."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "global",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "auction",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  110,
                  102,
                  116,
                  97,
                  117,
                  99,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "asset"
              }
            ]
          }
        },
        {
          "name": "asset",
          "docs": [
            "rejects the transfer unless `creator` is the current owner — the same",
            "guarantee an `owner =` constraint would give, without decoding Core's",
            "account layout here."
          ],
          "writable": true
        },
        {
          "name": "collection",
          "docs": [
            "passed for a transfer when the asset is part of one."
          ],
          "writable": true,
          "optional": true
        },
        {
          "name": "collectionAuction",
          "docs": [
            "The collection's own listing, when it has one.",
            "",
            "Present so this instruction can refuse to sell a piece out from under",
            "someone buying the whole set — see the handler. Optional because most",
            "collections are not for sale, and a caller who omits it is caught by the",
            "seeds constraint rather than trusted: the PDA is derived from the",
            "collection, so a wrong or substituted account can't satisfy it."
          ],
          "optional": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  108,
                  97,
                  117,
                  99,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "collection_auction.collection",
                "account": "collectionAuction"
              }
            ]
          }
        },
        {
          "name": "mplCoreProgram",
          "address": "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "startPrice",
          "type": "u64"
        },
        {
          "name": "floorPrice",
          "type": "u64"
        },
        {
          "name": "duration",
          "type": "i64"
        }
      ]
    },
    {
      "name": "mintGenesis",
      "docs": [
        "Mint a transferable fee-share genesis NFT (Metaplex Core) for a token,",
        "carrying a `share_bps` claim on its fee stream."
      ],
      "discriminator": [
        125,
        66,
        173,
        83,
        12,
        191,
        82,
        204
      ],
      "accounts": [
        {
          "name": "authority",
          "docs": [
            "The subject token's creator, issuing genesis fee-share NFTs for it."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "global",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "recipient"
        },
        {
          "name": "subjectMint"
        },
        {
          "name": "curve",
          "docs": [
            "The subject token's bonding curve — gates issuance to its creator."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  117,
                  114,
                  118,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "subjectMint"
              }
            ]
          }
        },
        {
          "name": "genesis",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  101,
                  110,
                  101,
                  115,
                  105,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "asset"
              }
            ]
          }
        },
        {
          "name": "pool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  101,
                  110,
                  112,
                  111,
                  111,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "subjectMint"
              }
            ]
          }
        },
        {
          "name": "asset",
          "docs": [
            "The new Core asset (client-generated keypair, signs its creation)."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "mplCoreProgram",
          "address": "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "shareBps",
          "type": "u16"
        },
        {
          "name": "uri",
          "type": "string"
        }
      ]
    },
    {
      "name": "mintGenesisBatch",
      "docs": [
        "Mint units into a listed genesis group — one Core asset per unit, held",
        "in escrow until bought. Assets are passed as remaining accounts."
      ],
      "discriminator": [
        74,
        20,
        223,
        228,
        24,
        196,
        121,
        233
      ],
      "accounts": [
        {
          "name": "creator",
          "docs": [
            "The group's creator, funding the assets."
          ],
          "writable": true,
          "signer": true,
          "relations": [
            "group"
          ]
        },
        {
          "name": "subjectMint",
          "relations": [
            "group"
          ]
        },
        {
          "name": "group",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  101,
                  110,
                  103,
                  114,
                  111,
                  117,
                  112
                ]
              },
              {
                "kind": "account",
                "path": "subjectMint"
              }
            ]
          }
        },
        {
          "name": "collection",
          "docs": [
            "Its update authority is the group PDA, which signs the mints below."
          ],
          "writable": true,
          "relations": [
            "group"
          ]
        },
        {
          "name": "mplCoreProgram",
          "address": "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "uri",
          "type": "string"
        }
      ]
    },
    {
      "name": "mintNft",
      "docs": [
        "Mint a plain Core NFT (collectible with an optional image), standalone",
        "or straight into one of the payer's collections."
      ],
      "discriminator": [
        211,
        57,
        6,
        167,
        15,
        219,
        35,
        251
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "recipient"
        },
        {
          "name": "asset",
          "docs": [
            "The new Core asset (client-generated keypair, signs its creation)."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "collection",
          "docs": [
            "the payer holds its update authority."
          ],
          "writable": true,
          "optional": true
        },
        {
          "name": "mplCoreProgram",
          "address": "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "name",
          "type": "string"
        },
        {
          "name": "uri",
          "type": "string"
        }
      ]
    },
    {
      "name": "mintPerk",
      "docs": [
        "Mint an upgradeable perk NFT (Metaplex Core) granting platform fee",
        "discounts; starts at level 1."
      ],
      "discriminator": [
        193,
        134,
        30,
        215,
        78,
        163,
        251,
        177
      ],
      "accounts": [
        {
          "name": "authority",
          "docs": [
            "Protocol keeper minting the perk to a participant."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "global",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "recipient"
        },
        {
          "name": "perkAuthority",
          "docs": [
            "program-controlled level-ups). Validated by seeds."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  101,
                  114,
                  107,
                  97,
                  117,
                  116,
                  104
                ]
              }
            ]
          }
        },
        {
          "name": "perk",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  101,
                  114,
                  107
                ]
              },
              {
                "kind": "account",
                "path": "asset"
              }
            ]
          }
        },
        {
          "name": "asset",
          "docs": [
            "The new Core asset (client-generated keypair, signs its creation)."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "mplCoreProgram",
          "address": "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "uri",
          "type": "string"
        }
      ]
    },
    {
      "name": "openTraderStats",
      "docs": [
        "Open the account recording a wallet's cumulative trading activity.",
        "Permissionless and self-funded; perk levels are gated on what it holds."
      ],
      "discriminator": [
        205,
        87,
        242,
        29,
        162,
        210,
        153,
        239
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "stats",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  97,
                  100,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "pause",
      "docs": [
        "Halt every gated instruction. One guardian is enough: a stop that has to",
        "collect signatures first arrives after the money."
      ],
      "discriminator": [
        211,
        22,
        221,
        251,
        74,
        121,
        193,
        47
      ],
      "accounts": [
        {
          "name": "guardian",
          "signer": true
        },
        {
          "name": "guardians",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  117,
                  97,
                  114,
                  100,
                  105,
                  97,
                  110,
                  115
                ]
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "promoteListing",
      "docs": [
        "Buy promoted placement for a live listing, asset or collection.",
        "",
        "The alternative to charging rent for listing space: listing stays free",
        "and perpetual, and money only ever buys extra visibility."
      ],
      "discriminator": [
        116,
        65,
        195,
        243,
        67,
        189,
        116,
        160
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "global",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "feeConfig",
          "docs": [
            "Holds the daily price, so placement can be repriced without a redeploy."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  102,
                  101,
                  101,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "treasury",
          "writable": true
        },
        {
          "name": "subject",
          "docs": [
            "gets settled by the auction account supplied below, whose `has_one`",
            "binds it to this key — so this is never trusted on its own."
          ]
        },
        {
          "name": "nftAuction",
          "docs": [
            "The listing, when the subject is a single asset."
          ],
          "optional": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  110,
                  102,
                  116,
                  97,
                  117,
                  99,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "subject"
              }
            ]
          }
        },
        {
          "name": "collectionAuction",
          "docs": [
            "The listing, when the subject is a whole collection."
          ],
          "optional": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  108,
                  97,
                  117,
                  99,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "subject"
              }
            ]
          }
        },
        {
          "name": "promotion",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  109,
                  111
                ]
              },
              {
                "kind": "account",
                "path": "subject"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "days",
          "type": "u16"
        },
        {
          "name": "maxLamports",
          "type": "u64"
        }
      ]
    },
    {
      "name": "reclaimCollectionAuction",
      "docs": [
        "Return an unsold collection's update authority to its lister."
      ],
      "discriminator": [
        252,
        50,
        68,
        57,
        167,
        222,
        131,
        192
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "creator",
          "writable": true
        },
        {
          "name": "auction",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  108,
                  97,
                  117,
                  99,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "collection"
              }
            ]
          }
        },
        {
          "name": "collection",
          "writable": true,
          "relations": [
            "auction"
          ]
        },
        {
          "name": "mplCoreProgram",
          "address": "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "reclaimGenesisUnits",
      "docs": [
        "Take unsold units back out of a genesis group's escrow. Without this a",
        "run that never sold out stranded the creator's own NFTs permanently.",
        "Units are passed as remaining accounts."
      ],
      "discriminator": [
        32,
        85,
        214,
        49,
        26,
        218,
        235,
        232
      ],
      "accounts": [
        {
          "name": "creator",
          "docs": [
            "The group's creator, and the only wallet its escrow answers to."
          ],
          "writable": true,
          "signer": true,
          "relations": [
            "group"
          ]
        },
        {
          "name": "subjectMint",
          "relations": [
            "group"
          ]
        },
        {
          "name": "group",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  101,
                  110,
                  103,
                  114,
                  111,
                  117,
                  112
                ]
              },
              {
                "kind": "account",
                "path": "subjectMint"
              }
            ]
          }
        },
        {
          "name": "collection",
          "writable": true,
          "relations": [
            "group"
          ]
        },
        {
          "name": "mplCoreProgram",
          "address": "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "reclaimNftAuction",
      "docs": [
        "Return an unsold 1-of-1 to its lister once the auction window closes.",
        "Without this an expired auction locks the NFT in escrow permanently —",
        "`buy_nft` refuses after the deadline and nothing else can move it."
      ],
      "discriminator": [
        25,
        122,
        34,
        249,
        35,
        48,
        3,
        119
      ],
      "accounts": [
        {
          "name": "payer",
          "docs": [
            "Pays the transaction. Reclaiming is permissionless — the asset can only",
            "ever go back to `auction.creator`, so anyone may trigger the return",
            "(a keeper, or the lister themselves)."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "creator",
          "writable": true
        },
        {
          "name": "auction",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  110,
                  102,
                  116,
                  97,
                  117,
                  99,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "asset"
              }
            ]
          }
        },
        {
          "name": "asset",
          "writable": true,
          "relations": [
            "auction"
          ]
        },
        {
          "name": "mplCoreProgram",
          "address": "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "removeFromCollection",
      "docs": [
        "Take an asset out of a collection, restoring the caller as its update",
        "authority. Also the prerequisite for burning the collection."
      ],
      "discriminator": [
        219,
        186,
        132,
        120,
        81,
        206,
        95,
        220
      ],
      "accounts": [
        {
          "name": "payer",
          "docs": [
            "Authority over the collection, and the asset's update authority after."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "asset",
          "writable": true
        },
        {
          "name": "collection",
          "docs": [
            "payer's authority over it."
          ],
          "writable": true
        },
        {
          "name": "mplCoreProgram",
          "address": "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "restoreToken",
      "docs": [
        "Lift a disavowal. Authority only — flagging is cheap, clearing is not."
      ],
      "discriminator": [
        152,
        117,
        183,
        85,
        166,
        199,
        88,
        80
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "global",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "mint",
          "relations": [
            "disavowal"
          ]
        },
        {
          "name": "disavowal",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  105,
                  115,
                  97,
                  118,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "resume",
      "docs": [
        "Approve resuming; the call that reaches `threshold` lifts the pause.",
        "Deliberately the expensive direction — no single key can undo a stop."
      ],
      "discriminator": [
        1,
        166,
        51,
        170,
        127,
        32,
        141,
        206
      ],
      "accounts": [
        {
          "name": "guardian",
          "signer": true
        },
        {
          "name": "guardians",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  117,
                  97,
                  114,
                  100,
                  105,
                  97,
                  110,
                  115
                ]
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "sell",
      "docs": [
        "Sell tokens back into the curve for SOL (slippage-guarded)."
      ],
      "discriminator": [
        51,
        230,
        133,
        164,
        1,
        127,
        131,
        173
      ],
      "accounts": [
        {
          "name": "seller",
          "writable": true,
          "signer": true
        },
        {
          "name": "global",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "treasury",
          "writable": true
        },
        {
          "name": "curve",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  117,
                  114,
                  118,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "mint",
          "relations": [
            "curve"
          ]
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "curve"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "sellerTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "seller"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "perk",
          "docs": [
            "Optional perk NFT owned by the seller; grants a trading-fee discount."
          ],
          "optional": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  101,
                  114,
                  107
                ]
              },
              {
                "kind": "account",
                "path": "perk.asset",
                "account": "perkNft"
              }
            ]
          }
        },
        {
          "name": "traderStats",
          "docs": [
            "Optional cumulative-activity record for the seller, credited with this",
            "trade's SOL. Optional for the reason set out in `perks::record_activity`:",
            "leaving it out forfeits progress toward your own fee discount and costs",
            "nobody else anything. A TS caller still has to name it",
            "(`traderStats: null`), as it already does for `perk`."
          ],
          "writable": true,
          "optional": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  97,
                  100,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "seller"
              }
            ]
          }
        },
        {
          "name": "genesisPool",
          "docs": [
            "The token's genesis fee pool.",
            "",
            "Required, and unchecked because it may legitimately not exist: most",
            "tokens never issue genesis NFTs. Whether it exists is read from the",
            "chain below rather than inferred from whether the caller bothered to",
            "pass it. As an `Option` this was a hole — omitting it made",
            "`total_share_bps` read as zero, so the whole creator fee accrued to the",
            "creator and the holders who had paid for a share of that stream were",
            "simply skipped. It cost the trader nothing to omit, and the creator was",
            "the one who gained.",
            "",
            "account; the handler validates the contents before trusting them."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  101,
                  110,
                  112,
                  111,
                  111,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "guardians",
          "docs": [
            "The emergency stop.",
            "",
            "Required, never optional: an optional stop is not a stop — omitting it",
            "would help the caller, which is exactly the shape that made the genesis",
            "pool exploitable. Unchecked because an empty account is the legitimate",
            "\"no guardian set installed yet\" state rather than an error.",
            ""
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  117,
                  97,
                  114,
                  100,
                  105,
                  97,
                  110,
                  115
                ]
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "tokenAmount",
          "type": "u64"
        },
        {
          "name": "minSolOut",
          "type": "u64"
        }
      ]
    },
    {
      "name": "sellConviction",
      "docs": [
        "Sell on a conviction curve; forfeits the early-exit penalty if still locked."
      ],
      "discriminator": [
        106,
        119,
        189,
        243,
        153,
        129,
        157,
        209
      ],
      "accounts": [
        {
          "name": "seller",
          "writable": true,
          "signer": true
        },
        {
          "name": "global",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "treasury",
          "docs": [
            "early-exit penalty (LP-reward proxy until real LP distribution ships)."
          ],
          "writable": true
        },
        {
          "name": "curve",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  118,
                  105,
                  99,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "mint",
          "relations": [
            "curve",
            "position"
          ]
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "curve"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "sellerTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "seller"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "position",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              },
              {
                "kind": "account",
                "path": "seller"
              }
            ]
          }
        },
        {
          "name": "guardians",
          "docs": [
            "The emergency stop.",
            "",
            "Required, never optional: an optional stop is not a stop — omitting it",
            "would help the caller, which is exactly the shape that made the genesis",
            "pool exploitable. Unchecked because an empty account is the legitimate",
            "\"no guardian set installed yet\" state rather than an error.",
            ""
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  117,
                  97,
                  114,
                  100,
                  105,
                  97,
                  110,
                  115
                ]
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "tokenAmount",
          "type": "u64"
        },
        {
          "name": "minSolOut",
          "type": "u64"
        }
      ]
    },
    {
      "name": "setAuthority",
      "docs": [
        "Hand protocol authority to a different wallet. Both the current and the",
        "incoming authority must sign, so authority can't be sent to a mistyped",
        "address that nobody controls."
      ],
      "discriminator": [
        133,
        250,
        37,
        21,
        110,
        163,
        26,
        121
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "global",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "newAuthority",
          "docs": [
            "sign — which is what proves the key exists and is controlled, rather",
            "than being a typo that would lock the protocol out permanently."
          ],
          "signer": true
        }
      ],
      "args": []
    },
    {
      "name": "setFeeConfig",
      "docs": [
        "Set the NFT market's fee schedule — its sale fee and the daily price of",
        "promoted placement — creating the account on first call."
      ],
      "discriminator": [
        221,
        222,
        52,
        206,
        114,
        198,
        64,
        91
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "global",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "feeConfig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  102,
                  101,
                  101,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "nftFeeBps",
          "type": {
            "option": "u16"
          }
        },
        {
          "name": "promoLamportsPerDay",
          "type": {
            "option": "u64"
          }
        }
      ]
    },
    {
      "name": "setGuardians",
      "docs": [
        "Install or rotate the guardian set that holds the emergency stop.",
        "Authority-only — it chooses who may pause, and can do neither itself."
      ],
      "discriminator": [
        166,
        69,
        140,
        183,
        157,
        169,
        253,
        40
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "global",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "guardians",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  117,
                  97,
                  114,
                  100,
                  105,
                  97,
                  110,
                  115
                ]
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "members",
          "type": {
            "vec": "pubkey"
          }
        },
        {
          "name": "threshold",
          "type": "u8"
        }
      ]
    },
    {
      "name": "setIssuer",
      "docs": [
        "Set or rotate the dedicated key authorized to sign SAS attestations",
        "(admin-gated by `Global.authority`)."
      ],
      "discriminator": [
        122,
        240,
        209,
        127,
        179,
        164,
        175,
        206
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "global",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "issuerConfig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  105,
                  115,
                  115,
                  117,
                  101,
                  114
                ]
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "issuer",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "setLaunchPolicy",
      "docs": [
        "Retune how often one wallet may launch. Authority-only. Until it runs,",
        "the defaults in `launch_quota` apply — 3 per rolling 24 hours."
      ],
      "discriminator": [
        160,
        215,
        179,
        54,
        156,
        201,
        130,
        112
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "global",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "policy",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  97,
                  117,
                  110,
                  99,
                  104,
                  112,
                  111,
                  108,
                  105,
                  99,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "maxLaunches",
          "type": "u8"
        },
        {
          "name": "windowSecs",
          "type": "i64"
        }
      ]
    },
    {
      "name": "settleAuction",
      "docs": [
        "Finalize a Dutch auction once it has ended."
      ],
      "discriminator": [
        246,
        196,
        183,
        98,
        222,
        139,
        46,
        133
      ],
      "accounts": [
        {
          "name": "caller",
          "signer": true
        },
        {
          "name": "global",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "auction",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  117,
                  99,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "mint",
          "relations": [
            "auction"
          ]
        }
      ],
      "args": []
    },
    {
      "name": "startAuction",
      "docs": [
        "Launch a token as a Dutch auction: price descends from `start_price` to",
        "`floor_price` over `duration` seconds (fair launch for narrative tokens)."
      ],
      "discriminator": [
        255,
        2,
        149,
        136,
        148,
        125,
        65,
        195
      ],
      "accounts": [
        {
          "name": "creator",
          "writable": true,
          "signer": true
        },
        {
          "name": "global",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "mint",
          "docs": [
            "New SPL mint (client-generated keypair, signs creation)."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "auction",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  117,
                  99,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "vault",
          "docs": [
            "Auction-owned vault holding the full allocation for sale."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "auction"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "metadata",
          "docs": [
            "handler and validated by the Token Metadata program against `mint`."
          ],
          "writable": true
        },
        {
          "name": "tokenMetadataProgram",
          "address": "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
        },
        {
          "name": "launchPolicy",
          "docs": [
            "The launch policy — how many launches a wallet gets per window.",
            "",
            "what keeps a fresh deployment bounded rather than unlimited."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  97,
                  117,
                  110,
                  99,
                  104,
                  112,
                  111,
                  108,
                  105,
                  99,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "launchQuota",
          "docs": [
            "This creator's recent launches. Created on their first one, paid for by",
            "them — the rate limit costs the protocol nothing to enforce."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  97,
                  117,
                  110,
                  99,
                  104,
                  113,
                  117,
                  111,
                  116,
                  97
                ]
              },
              {
                "kind": "account",
                "path": "creator"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "rent",
          "address": "SysvarRent111111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "tier",
          "type": {
            "defined": {
              "name": "mindshareTier"
            }
          }
        },
        {
          "name": "startPrice",
          "type": "u64"
        },
        {
          "name": "floorPrice",
          "type": "u64"
        },
        {
          "name": "duration",
          "type": "i64"
        },
        {
          "name": "metadata",
          "type": {
            "defined": {
              "name": "tokenMetadataArgs"
            }
          }
        }
      ]
    },
    {
      "name": "startNftAuction",
      "docs": [
        "Start a Dutch auction for a 1-of-1 Core NFT (escrowed under the auction PDA)."
      ],
      "discriminator": [
        85,
        231,
        160,
        162,
        63,
        216,
        129,
        42
      ],
      "accounts": [
        {
          "name": "creator",
          "writable": true,
          "signer": true
        },
        {
          "name": "global",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "auction",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  110,
                  102,
                  116,
                  97,
                  117,
                  99,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "asset"
              }
            ]
          }
        },
        {
          "name": "asset",
          "docs": [
            "The new 1-of-1 Core asset (client-generated keypair, signs its creation)."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "mplCoreProgram",
          "address": "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "startPrice",
          "type": "u64"
        },
        {
          "name": "floorPrice",
          "type": "u64"
        },
        {
          "name": "duration",
          "type": "i64"
        },
        {
          "name": "name",
          "type": "string"
        },
        {
          "name": "uri",
          "type": "string"
        }
      ]
    },
    {
      "name": "swap",
      "docs": [
        "Swap on a graduated token's AMM pool. `is_buy` = SOL in / tokens out."
      ],
      "discriminator": [
        248,
        198,
        158,
        145,
        225,
        117,
        135,
        200
      ],
      "accounts": [
        {
          "name": "trader",
          "writable": true,
          "signer": true
        },
        {
          "name": "global",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "pool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  109,
                  109
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "treasury",
          "writable": true
        },
        {
          "name": "curve",
          "docs": [
            "The token's bonding curve, which outlives graduation as the ledger for",
            "creator fees. Routing the AMM's creator cut here means `claim_creator_fee`",
            "keeps working unchanged, and a creator has one balance rather than one",
            "per venue."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  117,
                  114,
                  118,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "mint",
          "relations": [
            "pool",
            "curve"
          ]
        },
        {
          "name": "poolVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "pool"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "traderTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "trader"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "perk",
          "docs": [
            "Optional perk NFT owned by the trader; grants a trading-fee discount.",
            "Constrained to a perk PDA owned by the trader when supplied — same shape",
            "as Buy and Sell, because a perk that stops working the moment a token",
            "graduates is a benefit withdrawn exactly when it starts to matter."
          ],
          "optional": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  101,
                  114,
                  107
                ]
              },
              {
                "kind": "account",
                "path": "perk.asset",
                "account": "perkNft"
              }
            ]
          }
        },
        {
          "name": "traderStats",
          "docs": [
            "Optional cumulative-activity record for the trader, credited with the",
            "SOL side of this swap. Optional for the reason set out in",
            "`perks::record_activity`: leaving it out forfeits progress toward your",
            "own fee discount and costs nobody else anything. A TS caller still has to",
            "name it (`traderStats: null`), as it already does for `perk`."
          ],
          "writable": true,
          "optional": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  97,
                  100,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "trader"
              }
            ]
          }
        },
        {
          "name": "genesisPool",
          "docs": [
            "The token's genesis fee pool.",
            "",
            "Required, and unchecked because it may legitimately not exist. As an",
            "`Option` this was a hole on every trading path: omitting it made",
            "`total_share_bps` read as zero, so the entire creator fee accrued to the",
            "creator and the holders who had paid for a slice of it were skipped —",
            "at no cost to the trader who omitted it.",
            ""
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  101,
                  110,
                  112,
                  111,
                  111,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "disavowal",
          "docs": [
            "Set when the token's subject has disowned it.",
            "",
            "Checked only on the buy side — a holder must always be able to swap out",
            "of a disowned token, or the flag would cost them rather than protect",
            "them.",
            ""
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  105,
                  115,
                  97,
                  118,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "guardians",
          "docs": [
            "The emergency stop.",
            "",
            "Required, never optional: an optional stop is not a stop — omitting it",
            "would help the caller, which is exactly the shape that made the genesis",
            "pool exploitable. Unchecked because an empty account is the legitimate",
            "\"no guardian set installed yet\" state rather than an error.",
            ""
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  117,
                  97,
                  114,
                  100,
                  105,
                  97,
                  110,
                  115
                ]
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        }
      ],
      "args": [
        {
          "name": "amountIn",
          "type": "u64"
        },
        {
          "name": "minAmountOut",
          "type": "u64"
        },
        {
          "name": "isBuy",
          "type": "bool"
        }
      ]
    },
    {
      "name": "updateConfig",
      "docs": [
        "Retune the protocol's trading economics without a redeploy. Each",
        "argument is optional; omitting one leaves that value untouched."
      ],
      "discriminator": [
        29,
        158,
        252,
        191,
        10,
        83,
        219,
        99
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true
        },
        {
          "name": "global",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108
                ]
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "feeBps",
          "type": {
            "option": "u16"
          }
        },
        {
          "name": "creatorFeeShareBps",
          "type": {
            "option": "u16"
          }
        },
        {
          "name": "graduationSol",
          "type": {
            "option": "u64"
          }
        },
        {
          "name": "virtualTokenReserves",
          "type": {
            "option": "u64"
          }
        }
      ]
    },
    {
      "name": "updateMindshare",
      "docs": [
        "Refresh a token's on-chain mindshare snapshot from the Switchboard feed",
        "(permissionless crank; the value is trusted from the oracle, not the caller)."
      ],
      "discriminator": [
        104,
        234,
        116,
        148,
        49,
        247,
        14,
        215
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "mint"
        },
        {
          "name": "feed",
          "docs": [
            "in the handler via `read_mindshare_bps`."
          ]
        },
        {
          "name": "mindshare",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  105,
                  110,
                  100,
                  115,
                  104,
                  97,
                  114,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "verifyHandle",
      "docs": [
        "Verify an X handle↔wallet binding against a Solana Attestation Service",
        "attestation and mint a soulbound verification NFT (Metaplex Core)."
      ],
      "discriminator": [
        181,
        229,
        13,
        106,
        245,
        27,
        85,
        227
      ],
      "accounts": [
        {
          "name": "payer",
          "docs": [
            "Pays for the credential accounts. Can be anyone (subject or a relayer) —",
            "trust comes from the attestation, not from who submits the transaction."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "global",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "issuerConfig",
          "docs": [
            "The dedicated attestation issuer, if one has been configured via",
            "`set_issuer`. Absent (pre-migration) falls back to `global.authority`."
          ],
          "optional": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  105,
                  115,
                  115,
                  117,
                  101,
                  114
                ]
              }
            ]
          }
        },
        {
          "name": "subject"
        },
        {
          "name": "attestation",
          "docs": [
            "validated in the handler."
          ]
        },
        {
          "name": "verification",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  101,
                  114,
                  105,
                  102,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "subject"
              }
            ]
          }
        },
        {
          "name": "asset",
          "docs": [
            "The new Core asset (client-generated keypair, signs its own creation)."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "mplCoreProgram",
          "address": "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "handle",
          "type": "string"
        },
        {
          "name": "uri",
          "type": "string"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "ammPool",
      "discriminator": [
        54,
        82,
        185,
        138,
        179,
        191,
        211,
        169
      ]
    },
    {
      "name": "bondingCurve",
      "discriminator": [
        23,
        183,
        248,
        55,
        96,
        216,
        172,
        96
      ]
    },
    {
      "name": "collectionAuction",
      "discriminator": [
        237,
        166,
        208,
        136,
        232,
        239,
        243,
        135
      ]
    },
    {
      "name": "convictionCurve",
      "discriminator": [
        200,
        179,
        16,
        196,
        38,
        128,
        60,
        203
      ]
    },
    {
      "name": "convictionPosition",
      "discriminator": [
        225,
        205,
        115,
        31,
        53,
        218,
        180,
        224
      ]
    },
    {
      "name": "dutchAuction",
      "discriminator": [
        119,
        203,
        176,
        156,
        49,
        141,
        160,
        253
      ]
    },
    {
      "name": "feeConfig",
      "discriminator": [
        143,
        52,
        146,
        187,
        219,
        123,
        76,
        155
      ]
    },
    {
      "name": "genesisAllocation",
      "discriminator": [
        55,
        2,
        39,
        218,
        33,
        76,
        217,
        186
      ]
    },
    {
      "name": "genesisGroup",
      "discriminator": [
        33,
        74,
        243,
        51,
        94,
        167,
        214,
        120
      ]
    },
    {
      "name": "genesisNft",
      "discriminator": [
        57,
        165,
        72,
        64,
        68,
        194,
        73,
        83
      ]
    },
    {
      "name": "genesisPool",
      "discriminator": [
        37,
        249,
        210,
        206,
        17,
        196,
        114,
        128
      ]
    },
    {
      "name": "global",
      "discriminator": [
        167,
        232,
        232,
        177,
        200,
        108,
        114,
        127
      ]
    },
    {
      "name": "guardians",
      "discriminator": [
        223,
        20,
        125,
        88,
        240,
        91,
        38,
        220
      ]
    },
    {
      "name": "issuerConfig",
      "discriminator": [
        238,
        244,
        71,
        221,
        254,
        169,
        247,
        237
      ]
    },
    {
      "name": "launchPolicy",
      "discriminator": [
        219,
        235,
        220,
        211,
        225,
        110,
        83,
        26
      ]
    },
    {
      "name": "launchQuota",
      "discriminator": [
        1,
        250,
        176,
        39,
        101,
        126,
        183,
        239
      ]
    },
    {
      "name": "mindshareState",
      "discriminator": [
        195,
        70,
        26,
        170,
        103,
        161,
        120,
        180
      ]
    },
    {
      "name": "nftAuction",
      "discriminator": [
        198,
        128,
        54,
        35,
        103,
        212,
        3,
        98
      ]
    },
    {
      "name": "perkGrant",
      "discriminator": [
        118,
        20,
        144,
        208,
        23,
        126,
        230,
        122
      ]
    },
    {
      "name": "perkNft",
      "discriminator": [
        142,
        52,
        6,
        177,
        205,
        184,
        228,
        91
      ]
    },
    {
      "name": "promotion",
      "discriminator": [
        32,
        59,
        115,
        212,
        100,
        17,
        137,
        59
      ]
    },
    {
      "name": "revenueShare",
      "discriminator": [
        55,
        40,
        228,
        7,
        139,
        52,
        180,
        110
      ]
    },
    {
      "name": "revenueStake",
      "discriminator": [
        35,
        55,
        234,
        151,
        240,
        219,
        48,
        110
      ]
    },
    {
      "name": "tokenDisavowal",
      "discriminator": [
        53,
        98,
        110,
        203,
        44,
        20,
        204,
        93
      ]
    },
    {
      "name": "traderStats",
      "discriminator": [
        16,
        37,
        94,
        234,
        65,
        84,
        250,
        101
      ]
    },
    {
      "name": "verification",
      "discriminator": [
        230,
        33,
        140,
        88,
        132,
        240,
        116,
        178
      ]
    }
  ],
  "events": [
    {
      "name": "ammSwapEvent",
      "discriminator": [
        190,
        88,
        118,
        217,
        229,
        241,
        49,
        219
      ]
    },
    {
      "name": "authorityChangedEvent",
      "discriminator": [
        85,
        105,
        159,
        188,
        6,
        44,
        52,
        28
      ]
    },
    {
      "name": "collectionAuctionEvent",
      "discriminator": [
        115,
        201,
        255,
        152,
        155,
        134,
        103,
        226
      ]
    },
    {
      "name": "collectionListedEvent",
      "discriminator": [
        146,
        194,
        60,
        81,
        80,
        27,
        174,
        59
      ]
    },
    {
      "name": "configUpdatedEvent",
      "discriminator": [
        245,
        158,
        129,
        99,
        60,
        100,
        214,
        220
      ]
    },
    {
      "name": "creatorClaimEvent",
      "discriminator": [
        232,
        58,
        157,
        141,
        123,
        5,
        142,
        9
      ]
    },
    {
      "name": "disavowEvent",
      "discriminator": [
        251,
        243,
        163,
        126,
        243,
        163,
        224,
        155
      ]
    },
    {
      "name": "feeConfigUpdatedEvent",
      "discriminator": [
        139,
        188,
        235,
        116,
        222,
        55,
        95,
        201
      ]
    },
    {
      "name": "genesisBatchMintedEvent",
      "discriminator": [
        208,
        59,
        33,
        110,
        14,
        22,
        63,
        202
      ]
    },
    {
      "name": "genesisGroupClosedEvent",
      "discriminator": [
        59,
        254,
        96,
        52,
        199,
        75,
        162,
        213
      ]
    },
    {
      "name": "genesisGroupListedEvent",
      "discriminator": [
        141,
        212,
        97,
        151,
        107,
        238,
        93,
        133
      ]
    },
    {
      "name": "genesisUnitSoldEvent",
      "discriminator": [
        41,
        18,
        97,
        30,
        126,
        31,
        113,
        147
      ]
    },
    {
      "name": "genesisUnitsReclaimedEvent",
      "discriminator": [
        212,
        159,
        116,
        254,
        251,
        86,
        188,
        94
      ]
    },
    {
      "name": "graduateEvent",
      "discriminator": [
        141,
        122,
        133,
        105,
        171,
        125,
        237,
        111
      ]
    },
    {
      "name": "launchEvent",
      "discriminator": [
        27,
        193,
        47,
        130,
        115,
        92,
        239,
        94
      ]
    },
    {
      "name": "listingPromotedEvent",
      "discriminator": [
        24,
        12,
        92,
        196,
        217,
        208,
        251,
        100
      ]
    },
    {
      "name": "nftAuctionEvent",
      "discriminator": [
        123,
        100,
        93,
        131,
        133,
        209,
        126,
        38
      ]
    },
    {
      "name": "nftListedEvent",
      "discriminator": [
        209,
        171,
        3,
        47,
        191,
        120,
        133,
        103
      ]
    },
    {
      "name": "pauseEvent",
      "discriminator": [
        32,
        51,
        61,
        169,
        156,
        104,
        130,
        43
      ]
    },
    {
      "name": "poolCreatedEvent",
      "discriminator": [
        25,
        94,
        75,
        47,
        112,
        99,
        53,
        63
      ]
    },
    {
      "name": "tradeEvent",
      "discriminator": [
        189,
        219,
        127,
        211,
        78,
        230,
        97,
        238
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "mathOverflow",
      "msg": "Arithmetic overflow"
    },
    {
      "code": 6001,
      "name": "slippageExceeded",
      "msg": "Slippage tolerance exceeded"
    },
    {
      "code": 6002,
      "name": "curveComplete",
      "msg": "Bonding curve has already graduated"
    },
    {
      "code": 6003,
      "name": "zeroAmount",
      "msg": "Amount must be greater than zero"
    },
    {
      "code": 6004,
      "name": "insufficientReserves",
      "msg": "Insufficient reserves in the bonding curve"
    },
    {
      "code": 6005,
      "name": "invalidAuctionParams",
      "msg": "Invalid auction parameters"
    },
    {
      "code": 6006,
      "name": "auctionEnded",
      "msg": "Auction has already ended"
    },
    {
      "code": 6007,
      "name": "auctionNotEnded",
      "msg": "Auction has not ended yet"
    },
    {
      "code": 6008,
      "name": "soldOut",
      "msg": "Auction allocation is sold out"
    },
    {
      "code": 6009,
      "name": "collectionListed",
      "msg": "That collection is listed for sale — withdraw it before listing a member separately"
    },
    {
      "code": 6010,
      "name": "priceAboveMax",
      "msg": "Current price exceeds the bidder's maximum"
    },
    {
      "code": 6011,
      "name": "insufficientPosition",
      "msg": "Position holds fewer tokens than requested"
    },
    {
      "code": 6012,
      "name": "noStakers",
      "msg": "No shares staked to receive the deposit"
    },
    {
      "code": 6013,
      "name": "insufficientShares",
      "msg": "Not enough shares remain for sale"
    },
    {
      "code": 6014,
      "name": "unauthorized",
      "msg": "Caller is not authorized"
    },
    {
      "code": 6015,
      "name": "invalidHandle",
      "msg": "Handle is empty or too long"
    },
    {
      "code": 6016,
      "name": "maxLevelReached",
      "msg": "Perk is already at max level"
    },
    {
      "code": 6017,
      "name": "invalidAttestation",
      "msg": "Attestation account is invalid or malformed"
    },
    {
      "code": 6018,
      "name": "attestationExpired",
      "msg": "Attestation has expired"
    },
    {
      "code": 6019,
      "name": "invalidTreasury",
      "msg": "Treasury must be a System-owned account"
    },
    {
      "code": 6020,
      "name": "invalidFeed",
      "msg": "Invalid or unparseable Switchboard feed"
    },
    {
      "code": 6021,
      "name": "staleFeed",
      "msg": "Switchboard feed is stale or has too few samples"
    },
    {
      "code": 6022,
      "name": "noCreatorFees",
      "msg": "No creator fees available to claim"
    },
    {
      "code": 6023,
      "name": "notReadyToGraduate",
      "msg": "Curve has not reached the graduation threshold"
    },
    {
      "code": 6024,
      "name": "insufficientActivity",
      "msg": "Not enough trading volume or deposits to reach the next perk level"
    },
    {
      "code": 6025,
      "name": "invalidPerkLevel",
      "msg": "Perk level must be between 1 and MAX_PERK_LEVEL"
    },
    {
      "code": 6026,
      "name": "invalidTokenMetadata",
      "msg": "Token name, symbol or URI is empty or exceeds the Metaplex limit"
    },
    {
      "code": 6027,
      "name": "invalidGenesisGroup",
      "msg": "Genesis group size, share, price or per-wallet cap is invalid"
    },
    {
      "code": 6028,
      "name": "genesisGroupFull",
      "msg": "Genesis group already holds every unit it declared"
    },
    {
      "code": 6029,
      "name": "invalidGenesisBatch",
      "msg": "Genesis batch is empty or exceeds the per-call limit"
    },
    {
      "code": 6030,
      "name": "walletCapReached",
      "msg": "Wallet already holds its maximum units of this genesis group"
    },
    {
      "code": 6031,
      "name": "assetNotInGroup",
      "msg": "That asset is not a unit of this genesis group"
    },
    {
      "code": 6032,
      "name": "invalidConfig",
      "msg": "Config value is outside the range the protocol accepts"
    },
    {
      "code": 6033,
      "name": "noUnitsToReclaim",
      "msg": "No unsold units left in the group's escrow to reclaim"
    },
    {
      "code": 6034,
      "name": "genesisUnitsInEscrow",
      "msg": "Reclaim the group's unsold units before closing it"
    },
    {
      "code": 6035,
      "name": "shareOversubscribed",
      "msg": "That would commit more than 100% of the token's fee stream"
    },
    {
      "code": 6036,
      "name": "genesisPoolRequired",
      "msg": "This token has genesis holders — its fee pool must be supplied"
    },
    {
      "code": 6037,
      "name": "costAboveMax",
      "msg": "Total cost exceeds the maximum the caller authorised"
    },
    {
      "code": 6038,
      "name": "invalidAsset",
      "msg": "That account is not a Metaplex Core asset"
    },
    {
      "code": 6039,
      "name": "invalidGuardianSet",
      "msg": "Guardian set must be 1-5 distinct real keys with a reachable threshold"
    },
    {
      "code": 6040,
      "name": "notGuardian",
      "msg": "Caller is not a guardian"
    },
    {
      "code": 6041,
      "name": "protocolPaused",
      "msg": "The protocol is paused"
    },
    {
      "code": 6042,
      "name": "notPaused",
      "msg": "The protocol is not paused"
    },
    {
      "code": 6043,
      "name": "launchRateLimited",
      "msg": "This wallet has reached its launch limit for now"
    },
    {
      "code": 6044,
      "name": "invalidLaunchPolicy",
      "msg": "Launch policy is outside the range the program accepts"
    },
    {
      "code": 6045,
      "name": "tokenDisavowed",
      "msg": "This token has been disowned by its subject — it can be sold, not bought"
    },
    {
      "code": 6046,
      "name": "notDisavowed",
      "msg": "That token is not disavowed"
    }
  ],
  "types": [
    {
      "name": "ammPool",
      "docs": [
        "Native constant-product AMM pool created when a bonding curve graduates.",
        "Holds the migrated real SOL + remaining tokens; trades `x*y=k`. One PDA per mint."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "solReserves",
            "docs": [
              "Real SOL in the pool (lamports held in this account, above rent)."
            ],
            "type": "u64"
          },
          {
            "name": "tokenReserves",
            "docs": [
              "Tokens in the pool vault."
            ],
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "ammSwapEvent",
      "docs": [
        "Emitted on every AMM swap."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "trader",
            "type": "pubkey"
          },
          {
            "name": "isBuy",
            "type": "bool"
          },
          {
            "name": "amountIn",
            "type": "u64"
          },
          {
            "name": "amountOut",
            "type": "u64"
          },
          {
            "name": "solReserves",
            "type": "u64"
          },
          {
            "name": "tokenReserves",
            "type": "u64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "authorityChangedEvent",
      "docs": [
        "Emitted when protocol authority moves to a different wallet.",
        "",
        "Authority gates every privileged instruction, so a handover is the single",
        "most consequential administrative act — worth an indexable record rather",
        "than only a silent field change."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "previous",
            "type": "pubkey"
          },
          {
            "name": "current",
            "type": "pubkey"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "bondingCurve",
      "docs": [
        "Per-token bonding curve. One PDA per mint, seeded by mindshare tier."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "virtualSolReserves",
            "docs": [
              "Virtual SOL reserves (seeded from the mindshare tier)."
            ],
            "type": "u64"
          },
          {
            "name": "virtualTokenReserves",
            "docs": [
              "Virtual token reserves."
            ],
            "type": "u64"
          },
          {
            "name": "realSolReserves",
            "docs": [
              "Real SOL actually deposited into the curve."
            ],
            "type": "u64"
          },
          {
            "name": "realTokenReserves",
            "docs": [
              "Real tokens still held in the curve vault."
            ],
            "type": "u64"
          },
          {
            "name": "tokenTotalSupply",
            "docs": [
              "Total supply minted for this token."
            ],
            "type": "u64"
          },
          {
            "name": "creatorFees",
            "docs": [
              "Creator fees accrued (lamports held in this account, claimable once verified)."
            ],
            "type": "u64"
          },
          {
            "name": "tier",
            "docs": [
              "Mindshare tier this curve was seeded at."
            ],
            "type": "u8"
          },
          {
            "name": "complete",
            "docs": [
              "True once the curve has hit the graduation threshold."
            ],
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "collectionAuction",
      "docs": [
        "A whole mpl-core collection listed as a descending auction.",
        "",
        "Deliberately not reusing `NftAuction`. A collection has no owner — only an",
        "update authority — so it cannot be escrowed with a transfer the way an",
        "asset is. This PDA takes the update authority instead, which means the",
        "escrow, the sale and the reclaim are all authority reassignments rather",
        "than transfers, and the two lifecycles never share an instruction."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "collection",
            "docs": [
              "The Core collection being sold."
            ],
            "type": "pubkey"
          },
          {
            "name": "creator",
            "docs": [
              "Seller, who gets the update authority back on a reclaim."
            ],
            "type": "pubkey"
          },
          {
            "name": "startPrice",
            "docs": [
              "Ceiling price in lamports."
            ],
            "type": "u64"
          },
          {
            "name": "floorPrice",
            "docs": [
              "Floor price in lamports."
            ],
            "type": "u64"
          },
          {
            "name": "startTime",
            "type": "i64"
          },
          {
            "name": "duration",
            "type": "i64"
          },
          {
            "name": "complete",
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "collectionAuctionEvent",
      "docs": [
        "Emitted when a collection listing ends — sold, or returned unsold."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "collection",
            "type": "pubkey"
          },
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "counterparty",
            "docs": [
              "The buyer on a sale; equal to `creator` on a reclaim."
            ],
            "type": "pubkey"
          },
          {
            "name": "outcome",
            "docs": [
              "One of the `NFT_*` discriminants, shared with `NftAuctionEvent`."
            ],
            "type": "u8"
          },
          {
            "name": "price",
            "docs": [
              "Descending price actually paid, in lamports. Zero on a reclaim."
            ],
            "type": "u64"
          },
          {
            "name": "fee",
            "docs": [
              "Protocol fee charged on top of `price`. Zero on a reclaim."
            ],
            "type": "u64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "collectionListedEvent",
      "docs": [
        "Emitted when a collection is listed for sale.",
        "",
        "Separate from `NftListedEvent` rather than reusing it with the collection",
        "in the `asset` field: a feed that can't tell the two apart renders a whole",
        "collection as though it were a single piece."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "collection",
            "type": "pubkey"
          },
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "size",
            "docs": [
              "Members at listing time — what the buyer is being offered."
            ],
            "type": "u32"
          },
          {
            "name": "startPrice",
            "type": "u64"
          },
          {
            "name": "floorPrice",
            "type": "u64"
          },
          {
            "name": "duration",
            "type": "i64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "configUpdatedEvent",
      "docs": [
        "Emitted when the protocol's trading economics are retuned.",
        "",
        "Every field is the value in force *after* the call, supplied or not, so an",
        "indexer reading one event knows the whole configuration rather than a diff",
        "it has to replay from genesis to interpret."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "feeBps",
            "type": "u16"
          },
          {
            "name": "creatorFeeShareBps",
            "type": "u16"
          },
          {
            "name": "graduationSol",
            "type": "u64"
          },
          {
            "name": "virtualTokenReserves",
            "type": "u64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "convictionCurve",
      "docs": [
        "Per-token conviction curve. Prices identically to the bonding curve",
        "(constant-product virtual reserves) but every buy time-locks the holder and",
        "early sells forfeit a penalty. One PDA per mint."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "virtualSolReserves",
            "type": "u64"
          },
          {
            "name": "virtualTokenReserves",
            "type": "u64"
          },
          {
            "name": "realSolReserves",
            "type": "u64"
          },
          {
            "name": "realTokenReserves",
            "type": "u64"
          },
          {
            "name": "tokenTotalSupply",
            "type": "u64"
          },
          {
            "name": "lockPeriod",
            "docs": [
              "Seconds a position is locked after each buy."
            ],
            "type": "i64"
          },
          {
            "name": "earlyExitPenaltyBps",
            "docs": [
              "Penalty (bps) applied to proceeds when selling before unlock."
            ],
            "type": "u16"
          },
          {
            "name": "tier",
            "type": "u8"
          },
          {
            "name": "complete",
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "convictionPosition",
      "docs": [
        "A holder's stake in a conviction curve. Seeded per (mint, owner). Each buy",
        "re-locks the whole position until `unlock_time`."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "docs": [
              "Base units currently held under this position."
            ],
            "type": "u64"
          },
          {
            "name": "unlockTime",
            "docs": [
              "Unix time at which the position unlocks (penalty-free selling)."
            ],
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "creatorClaimEvent",
      "docs": [
        "Emitted when a verified creator claims accrued creator fees."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "disavowEvent",
      "docs": [
        "Emitted when a token is disowned or restored.",
        "",
        "Carries the direction as a flag rather than being two events, so an indexer",
        "watching a mint sees one ordered stream and cannot render a restore it",
        "missed the flag for."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "disavowedBy",
            "type": "pubkey"
          },
          {
            "name": "reason",
            "type": {
              "defined": {
                "name": "disavowReason"
              }
            }
          },
          {
            "name": "disavowed",
            "docs": [
              "State *after* this call."
            ],
            "type": "bool"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "disavowReason",
      "docs": [
        "Why a token was disowned. Deliberately coarse: a free-text field would grow",
        "into an unmoderated message shown on someone's token page."
      ],
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "disowned"
          },
          {
            "name": "subjectGone"
          },
          {
            "name": "abuse"
          }
        ]
      }
    },
    {
      "name": "dutchAuction",
      "docs": [
        "Per-token Dutch auction. One PDA per mint. Price descends linearly from",
        "`start_price` to `floor_price` over `duration` seconds; bidders pay the",
        "current price, so buying early costs more (fair launch, no front-running edge)."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "startPrice",
            "docs": [
              "Ceiling price, lamports per whole token."
            ],
            "type": "u64"
          },
          {
            "name": "floorPrice",
            "docs": [
              "Floor price, lamports per whole token."
            ],
            "type": "u64"
          },
          {
            "name": "startTime",
            "docs": [
              "Auction start (unix seconds)."
            ],
            "type": "i64"
          },
          {
            "name": "duration",
            "docs": [
              "Auction length in seconds."
            ],
            "type": "i64"
          },
          {
            "name": "totalForSale",
            "docs": [
              "Total base units offered for sale."
            ],
            "type": "u64"
          },
          {
            "name": "tokensSold",
            "docs": [
              "Base units sold so far."
            ],
            "type": "u64"
          },
          {
            "name": "realSolReserves",
            "docs": [
              "Lamports of proceeds collected."
            ],
            "type": "u64"
          },
          {
            "name": "tier",
            "docs": [
              "Mindshare tier this auction was tagged at."
            ],
            "type": "u8"
          },
          {
            "name": "complete",
            "docs": [
              "True once sold out or settled after end."
            ],
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "feeConfig",
      "docs": [
        "The NFT market's own fee schedule, tunable without a redeploy.",
        "",
        "Lives beside `Global` rather than inside it because `Global` is already",
        "on-chain at a fixed length (see `FEECONFIG_SEED`), and it holds the NFT",
        "numbers specifically: a trading fee and a marketplace fee answer different",
        "questions and were never the same number, they were just stored as one.",
        "",
        "Required by the instructions that charge it, never optional. An optional",
        "override would let a buyer omit the account and pay the old, lower number —",
        "the opposite of the perk discount, where omitting it only costs the caller."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "nftFeeBps",
            "docs": [
              "Fee on an NFT or collection sale, in bps of the sale price."
            ],
            "type": "u16"
          },
          {
            "name": "promoLamportsPerDay",
            "docs": [
              "Cost of one day of promoted placement, lamports."
            ],
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "feeConfigUpdatedEvent",
      "docs": [
        "Emitted when the NFT market's fee schedule changes."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "nftFeeBps",
            "type": "u16"
          },
          {
            "name": "promoLamportsPerDay",
            "type": "u64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "genesisAllocation",
      "docs": [
        "How many units one wallet has taken from one token's genesis group.",
        "",
        "Keyed by (subject mint, buyer) rather than counted on the buyer's NFTs: the",
        "units are transferable, so a buyer who sold theirs on would otherwise be",
        "free to come back and buy the cap again. What the cap limits is how much of",
        "the run one wallet may take from the group, which is a fact about purchases,",
        "not about current holdings."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "subjectMint",
            "type": "pubkey"
          },
          {
            "name": "buyer",
            "type": "pubkey"
          },
          {
            "name": "units",
            "docs": [
              "Units bought from this group, ever."
            ],
            "type": "u16"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "genesisBatchMintedEvent",
      "docs": [
        "Emitted when units are minted into a group's collection."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "subjectMint",
            "type": "pubkey"
          },
          {
            "name": "collection",
            "type": "pubkey"
          },
          {
            "name": "units",
            "docs": [
              "Units created by this call."
            ],
            "type": "u16"
          },
          {
            "name": "mintedUnits",
            "docs": [
              "Running total minted, out of `total_units`."
            ],
            "type": "u16"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "genesisGroup",
      "docs": [
        "A token's fixed-price run of genesis fee-share NFTs. One PDA per subject mint.",
        "",
        "Where `mint_genesis` issues one NFT to a named recipient on terms the creator",
        "negotiated off-chain, a group is a public offer: N identical units, a fixed",
        "price, one collection, and a cap on how many any single wallet may take.",
        "",
        "The PDA is the collection's update authority for the group's whole life,",
        "which is what makes `total_units` mean anything. If the creator kept it they",
        "could mint extra units into the same collection at any time, and every",
        "existing holder's share of the fee stream would quietly shrink — the buyer",
        "would have no way to tell a five-unit run from a five-hundred-unit one. With",
        "the authority escrowed here, the only path to a new unit is",
        "`mint_genesis_batch`, which counts."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "subjectMint",
            "docs": [
              "The token whose fee stream every unit shares."
            ],
            "type": "pubkey"
          },
          {
            "name": "creator",
            "docs": [
              "Seller of the units, and the collection's authority on a reclaim."
            ],
            "type": "pubkey"
          },
          {
            "name": "collection",
            "docs": [
              "Core collection holding the units; its update authority is escrowed here."
            ],
            "type": "pubkey"
          },
          {
            "name": "price",
            "docs": [
              "Fixed price per unit, lamports. Protocol fee is charged on top."
            ],
            "type": "u64"
          },
          {
            "name": "shareBps",
            "docs": [
              "Slice of the creator's fee stream each unit carries, in bps."
            ],
            "type": "u16"
          },
          {
            "name": "totalUnits",
            "docs": [
              "Units this group will ever contain."
            ],
            "type": "u16"
          },
          {
            "name": "mintedUnits",
            "docs": [
              "Units minted into the collection so far (<= `total_units`)."
            ],
            "type": "u16"
          },
          {
            "name": "soldUnits",
            "docs": [
              "Units sold so far (<= `minted_units`)."
            ],
            "type": "u16"
          },
          {
            "name": "perWalletCap",
            "docs": [
              "Most units one wallet may buy."
            ],
            "type": "u16"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "genesisGroupClosedEvent",
      "docs": [
        "Emitted when a group is delisted and its collection handed back."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "subjectMint",
            "type": "pubkey"
          },
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "collection",
            "type": "pubkey"
          },
          {
            "name": "soldUnits",
            "docs": [
              "Units that found a buyer before it closed; they keep earning."
            ],
            "type": "u16"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "genesisGroupListedEvent",
      "docs": [
        "Emitted when a token opens a fixed-price run of genesis fee-share NFTs."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "subjectMint",
            "type": "pubkey"
          },
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "collection",
            "type": "pubkey"
          },
          {
            "name": "totalUnits",
            "docs": [
              "Units the run will ever contain — the denominator a buyer's share is",
              "judged against, and the number the escrowed collection authority makes",
              "binding."
            ],
            "type": "u16"
          },
          {
            "name": "shareBps",
            "type": "u16"
          },
          {
            "name": "price",
            "type": "u64"
          },
          {
            "name": "perWalletCap",
            "type": "u16"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "genesisNft",
      "docs": [
        "A fee-share genesis NFT: a transferable Metaplex Core asset minted to an",
        "early participant of a specific token, carrying a `share_bps` claim on that",
        "token's fee stream. One PDA per asset. (Claim routing wires up during the",
        "fee-distribution pass.)"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "asset",
            "docs": [
              "The Metaplex Core asset backing this genesis share."
            ],
            "type": "pubkey"
          },
          {
            "name": "owner",
            "docs": [
              "Current owner at mint time."
            ],
            "type": "pubkey"
          },
          {
            "name": "subjectMint",
            "docs": [
              "The token whose fee stream this NFT shares."
            ],
            "type": "pubkey"
          },
          {
            "name": "shareBps",
            "docs": [
              "Fraction of the token's fee stream, in basis points."
            ],
            "type": "u16"
          },
          {
            "name": "rewardDebt",
            "docs": [
              "Accumulator snapshot (`accrued(share_bps, acc)`) at last settle."
            ],
            "type": "u128"
          },
          {
            "name": "unclaimed",
            "docs": [
              "Settled-but-unclaimed fees."
            ],
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "genesisPool",
      "docs": [
        "Per-token pool of genesis fees, split pro-rata across that token's genesis",
        "NFTs by `share_bps`. One PDA per subject mint."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "subjectMint",
            "type": "pubkey"
          },
          {
            "name": "totalShareBps",
            "docs": [
              "Sum of `share_bps` across the token's minted genesis NFTs."
            ],
            "type": "u64"
          },
          {
            "name": "accPerShare",
            "docs": [
              "Cumulative fee per share-bps, scaled by `revenue::ACC_SCALE`."
            ],
            "type": "u128"
          },
          {
            "name": "reserves",
            "docs": [
              "Lamports of deposited fees still available to claim."
            ],
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "genesisUnitSoldEvent",
      "docs": [
        "Emitted when a buyer takes one unit out of a group."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "subjectMint",
            "type": "pubkey"
          },
          {
            "name": "asset",
            "type": "pubkey"
          },
          {
            "name": "buyer",
            "type": "pubkey"
          },
          {
            "name": "price",
            "type": "u64"
          },
          {
            "name": "fee",
            "docs": [
              "Protocol fee charged on top of `price`."
            ],
            "type": "u64"
          },
          {
            "name": "shareBps",
            "type": "u16"
          },
          {
            "name": "soldUnits",
            "docs": [
              "Units sold from the group after this sale."
            ],
            "type": "u16"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "genesisUnitsReclaimedEvent",
      "docs": [
        "Emitted when a creator takes unsold units back out of a group's escrow."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "subjectMint",
            "type": "pubkey"
          },
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "units",
            "docs": [
              "Units returned by this call."
            ],
            "type": "u16"
          },
          {
            "name": "mintedUnits",
            "docs": [
              "Units the group still holds, sold and unsold together."
            ],
            "type": "u16"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "global",
      "docs": [
        "Protocol-wide configuration, created once at `initialize`."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "docs": [
              "Admin authority (may update config in later phases)."
            ],
            "type": "pubkey"
          },
          {
            "name": "treasury",
            "docs": [
              "Destination for trading fees."
            ],
            "type": "pubkey"
          },
          {
            "name": "feeBps",
            "docs": [
              "Curve trading fee in basis points."
            ],
            "type": "u16"
          },
          {
            "name": "creatorFeeShareBps",
            "docs": [
              "Creator's share of each trading fee, in bps of the fee."
            ],
            "type": "u16"
          },
          {
            "name": "graduationSol",
            "docs": [
              "Real SOL raised at which a curve graduates."
            ],
            "type": "u64"
          },
          {
            "name": "virtualTokenReserves",
            "docs": [
              "Default virtual token reserves seeded into new curves."
            ],
            "type": "u64"
          },
          {
            "name": "tokenTotalSupply",
            "docs": [
              "Total supply minted per launched token."
            ],
            "type": "u64"
          },
          {
            "name": "tokenDecimals",
            "docs": [
              "SPL mint decimals for launched tokens."
            ],
            "type": "u8"
          },
          {
            "name": "tokensLaunched",
            "docs": [
              "Number of tokens launched through the program."
            ],
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "graduateEvent",
      "docs": [
        "Emitted once, when a curve crosses the graduation threshold."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "realSolReserves",
            "type": "u64"
          },
          {
            "name": "realTokenReserves",
            "type": "u64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "guardians",
      "docs": [
        "The emergency stop, and the people who may pull it.",
        "",
        "A singleton beside `Global` rather than fields inside it, for the reason",
        "`FeeConfig` is also its own account: `Global` is live on-chain at a fixed",
        "length, and Anchor sizes accounts exactly, so lengthening it would fail to",
        "deserialise on every instruction that reads it.",
        "",
        "Pausing takes one guardian and resuming takes `threshold` of them — see",
        "`guardians.rs` for why those two numbers are deliberately different."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "docs": [
              "May rotate the set. The protocol authority."
            ],
            "type": "pubkey"
          },
          {
            "name": "members",
            "docs": [
              "Guardian slots. Everything past `count` is the default key."
            ],
            "type": {
              "array": [
                "pubkey",
                5
              ]
            }
          },
          {
            "name": "count",
            "docs": [
              "How many slots are live."
            ],
            "type": "u8"
          },
          {
            "name": "threshold",
            "docs": [
              "Approvals required to resume. Pausing always takes exactly one."
            ],
            "type": "u8"
          },
          {
            "name": "paused",
            "docs": [
              "Whether gated instructions are currently refused."
            ],
            "type": "bool"
          },
          {
            "name": "pausedAt",
            "docs": [
              "When the current pause began, for the record."
            ],
            "type": "i64"
          },
          {
            "name": "resumeApprovals",
            "docs": [
              "Guardians who have approved the *current* resume attempt. Cleared on",
              "every pause, so approvals can never carry over from an older incident."
            ],
            "type": {
              "array": [
                "pubkey",
                5
              ]
            }
          },
          {
            "name": "resumeCount",
            "type": "u8"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "issuerConfig",
      "docs": [
        "The dedicated key authorized to sign SAS attestations for `verify_handle`,",
        "separate from `Global.authority` so the attestation issuer (a hot key held",
        "by the `/api/verify` service) can rotate without touching the protocol's",
        "admin key. Singleton PDA; absent until `set_issuer` is called for the",
        "first time, in which case `verify_handle` still trusts `Global.authority`."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "issuer",
            "type": "pubkey"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "launchEvent",
      "docs": [
        "Emitted when a new token is launched under any mechanism."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "mechanism",
            "docs": [
              "One of the `MECH_*` discriminants."
            ],
            "type": "u8"
          },
          {
            "name": "tier",
            "type": "u8"
          },
          {
            "name": "virtualSolReserves",
            "type": "u64"
          },
          {
            "name": "virtualTokenReserves",
            "type": "u64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "launchPolicy",
      "docs": [
        "How often any one wallet may launch. Singleton, authority-set.",
        "",
        "Its own account rather than fields on `Global` or `FeeConfig`, both of which",
        "are live on-chain at a fixed length — Anchor sizes accounts exactly, so",
        "lengthening either fails to deserialise on every instruction that reads it.",
        "",
        "Absent means the defaults in `launch_quota.rs` apply, so a deploy never",
        "leaves launching unbounded while waiting for a config transaction."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "maxLaunches",
            "docs": [
              "Launches allowed per window, per wallet."
            ],
            "type": "u8"
          },
          {
            "name": "windowSecs",
            "docs": [
              "Length of the window in seconds."
            ],
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "launchQuota",
      "docs": [
        "One wallet's recent launches, as a ring of unix timestamps.",
        "",
        "Timestamps rather than a counter: a counter needs a reset, and a reset means",
        "a boundary a script can launch across twice. See `launch_quota.rs`."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "stamps",
            "docs": [
              "Recent launch times; zeroed slots are unused."
            ],
            "type": {
              "array": [
                "i64",
                8
              ]
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "listingPromotedEvent",
      "docs": [
        "Emitted when a listing buys promoted placement."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "subject",
            "type": "pubkey"
          },
          {
            "name": "payer",
            "type": "pubkey"
          },
          {
            "name": "days",
            "type": "u16"
          },
          {
            "name": "lamports",
            "type": "u64"
          },
          {
            "name": "promotedUntil",
            "docs": [
              "Where the promotion now runs to, after stacking onto any remainder."
            ],
            "type": "i64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "mindshareState",
      "docs": [
        "On-chain snapshot of a token's mindshare, sourced from the Switchboard feed.",
        "Keyed by mint (works for any launch mechanism) and kept fresh by an",
        "oracle-gated `update_mindshare` crank. Instructions that want to react to",
        "attention (dynamic graduation, mindshare-weighted rewards) read this cheaply",
        "instead of requiring a fresh oracle read in their own transaction. Separate",
        "from the curve accounts so adding it never changes their layout."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "mindshareBps",
            "docs": [
              "Conversation share in basis points (e.g. 3.24% => 324)."
            ],
            "type": "u64"
          },
          {
            "name": "tier",
            "docs": [
              "Tier derived from `mindshare_bps` at the last update."
            ],
            "type": "u8"
          },
          {
            "name": "updatedSlot",
            "docs": [
              "Slot of the last oracle update (freshness for readers)."
            ],
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "mindshareTier",
      "docs": [
        "Mindshare rank tier supplied by the (trusted, off-chain) launch keeper.",
        "Determines the curve's starting virtual SOL reserve."
      ],
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "newEntrant"
          },
          {
            "name": "emerging"
          },
          {
            "name": "top100"
          },
          {
            "name": "top10"
          }
        ]
      }
    },
    {
      "name": "nftAuction",
      "docs": [
        "A Dutch auction for a single 1-of-1 Metaplex Core NFT (art/music verticals).",
        "The asset is escrowed under this PDA (which owns it) until sold; price",
        "descends from `start_price` to `floor_price`. One PDA per asset."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "asset",
            "docs": [
              "The 1-of-1 Core asset being sold."
            ],
            "type": "pubkey"
          },
          {
            "name": "creator",
            "docs": [
              "Seller who receives the proceeds."
            ],
            "type": "pubkey"
          },
          {
            "name": "startPrice",
            "docs": [
              "Ceiling price in lamports (absolute, for the single NFT)."
            ],
            "type": "u64"
          },
          {
            "name": "floorPrice",
            "docs": [
              "Floor price in lamports."
            ],
            "type": "u64"
          },
          {
            "name": "startTime",
            "type": "i64"
          },
          {
            "name": "duration",
            "type": "i64"
          },
          {
            "name": "complete",
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "nftAuctionEvent",
      "docs": [
        "Emitted when a 1-of-1 auction ends — sold to a buyer, or returned unsold.",
        "",
        "`NftAuction.complete` is set by both paths, so account state alone can't",
        "distinguish them after the fact; without this, an indexer had nothing to",
        "read and a lister got no notice that their asset had sold."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "asset",
            "type": "pubkey"
          },
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "counterparty",
            "docs": [
              "The buyer on a sale; equal to `creator` on a reclaim."
            ],
            "type": "pubkey"
          },
          {
            "name": "outcome",
            "docs": [
              "One of the `NFT_*` discriminants."
            ],
            "type": "u8"
          },
          {
            "name": "price",
            "docs": [
              "Descending price actually paid, in lamports. Zero on a reclaim."
            ],
            "type": "u64"
          },
          {
            "name": "fee",
            "docs": [
              "Protocol fee charged on top of `price`. Zero on a reclaim."
            ],
            "type": "u64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "nftListedEvent",
      "docs": [
        "Emitted when a 1-of-1 is listed, whether freshly minted or already owned."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "asset",
            "type": "pubkey"
          },
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "startPrice",
            "type": "u64"
          },
          {
            "name": "floorPrice",
            "type": "u64"
          },
          {
            "name": "duration",
            "type": "i64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "pauseEvent",
      "docs": [
        "Emitted whenever the emergency stop changes hands, in either direction.",
        "",
        "Carries the tally as well as the state because a resume is a sequence, not",
        "an instant: watchers need to see \"2 of 3 so far\" while it is happening, not",
        "only the moment it completes."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "guardian",
            "docs": [
              "The guardian whose signature caused this."
            ],
            "type": "pubkey"
          },
          {
            "name": "paused",
            "docs": [
              "State *after* this call."
            ],
            "type": "bool"
          },
          {
            "name": "approvals",
            "docs": [
              "Resume approvals standing after this call."
            ],
            "type": "u8"
          },
          {
            "name": "threshold",
            "type": "u8"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "perkGrant",
      "docs": [
        "A pending perk grant, awaiting the recipient to claim it.",
        "",
        "Splits `mint_perk` into authorise-then-claim so the protocol can approve a",
        "batch of task completions cheaply while each recipient pays for their own",
        "Core asset. The authority still decides who gets one — this account IS the",
        "authorisation, and `claim_perk` mints only when it exists."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "recipient",
            "docs": [
              "Wallet allowed to claim; the only account this grant can mint to."
            ],
            "type": "pubkey"
          },
          {
            "name": "level",
            "docs": [
              "Level to mint at (1..=MAX_PERK_LEVEL)."
            ],
            "type": "u8"
          },
          {
            "name": "granter",
            "docs": [
              "Refund target when the grant is consumed — whoever paid to create it."
            ],
            "type": "pubkey"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "perkNft",
      "docs": [
        "An upgradeable perk NFT record. The Metaplex Core asset's Attributes carry",
        "the level/discount for display; this PDA is the on-chain source of truth that",
        "trading instructions read to apply the holder's fee discount. One per asset."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "asset",
            "docs": [
              "The Metaplex Core asset backing this perk."
            ],
            "type": "pubkey"
          },
          {
            "name": "owner",
            "docs": [
              "Wallet the perk was minted to."
            ],
            "type": "pubkey"
          },
          {
            "name": "level",
            "docs": [
              "Current level (1..=MAX_PERK_LEVEL)."
            ],
            "type": "u8"
          },
          {
            "name": "discountBps",
            "docs": [
              "Trading-fee discount granted, in basis points **of the fee** — 1000 is",
              "10% off whatever the fee happens to be, not 10 bps off it.",
              "",
              "Cached for display and for the IDL; `level` is the source of truth. The",
              "trading instructions recompute from `level` so a perk minted under older",
              "terms isn't stranded on them."
            ],
            "type": "u16"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "poolCreatedEvent",
      "docs": [
        "Emitted when a graduated curve's liquidity migrates into a native AMM pool."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "solReserves",
            "type": "u64"
          },
          {
            "name": "tokenReserves",
            "type": "u64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "promotion",
      "docs": [
        "Paid placement for one listing.",
        "",
        "Kept in its own PDA rather than as fields on `NftAuction` and",
        "`CollectionAuction`. Adding fields to either would lengthen an account that",
        "already exists on-chain, and every listing created before the change would",
        "fail to deserialize against the longer struct. A separate account also lets",
        "one instruction promote both kinds, since it keys off the subject rather",
        "than the listing type."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "subject",
            "docs": [
              "The asset or collection whose listing is promoted."
            ],
            "type": "pubkey"
          },
          {
            "name": "payer",
            "docs": [
              "Most recent payer. Informational — anyone may top up a listing."
            ],
            "type": "pubkey"
          },
          {
            "name": "promotedUntil",
            "docs": [
              "Unix seconds through which this listing ranks as promoted."
            ],
            "type": "i64"
          },
          {
            "name": "totalPaid",
            "docs": [
              "Lifetime lamports spent here, for breaking ties between listings whose",
              "promotion is otherwise equal."
            ],
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "revenueShare",
      "docs": [
        "Per-token revenue-share pool. Shares are sold at a fixed `share_price` and",
        "entitle the holder to a pro-rata cut of deposited revenue, tracked with a",
        "cumulative `acc_revenue_per_share` accumulator. One PDA per mint."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "sharePrice",
            "docs": [
              "Fixed acquisition price, lamports per whole token."
            ],
            "type": "u64"
          },
          {
            "name": "tokenTotalSupply",
            "type": "u64"
          },
          {
            "name": "sharesSold",
            "docs": [
              "Shares sold (== total staked, since buying auto-stakes)."
            ],
            "type": "u64"
          },
          {
            "name": "totalStaked",
            "docs": [
              "Total shares currently entitled to revenue."
            ],
            "type": "u64"
          },
          {
            "name": "accRevenuePerShare",
            "docs": [
              "Cumulative revenue per share, scaled by `revenue::ACC_SCALE`."
            ],
            "type": "u128"
          },
          {
            "name": "revenueReserves",
            "docs": [
              "Lamports of deposited revenue still available to claim."
            ],
            "type": "u64"
          },
          {
            "name": "tier",
            "type": "u8"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "revenueStake",
      "docs": [
        "A holder's revenue-share stake. Seeded per (mint, owner)."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "stakedAmount",
            "docs": [
              "Shares held (base units)."
            ],
            "type": "u64"
          },
          {
            "name": "rewardDebt",
            "docs": [
              "Accumulator snapshot: `accrued(staked, acc)` at last settle."
            ],
            "type": "u128"
          },
          {
            "name": "unclaimed",
            "docs": [
              "Settled-but-unclaimed revenue (banked when stake changes)."
            ],
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "tokenDisavowal",
      "docs": [
        "A token the subject it names has disowned.",
        "",
        "Keyed by mint rather than by handle, because a handle is not something the",
        "program can check. No launch instruction receives one: the association",
        "between \"@alice\" and a mint lives entirely in the token's metadata and the",
        "off-chain registry, so a handle blocklist could only ever be enforced by the",
        "app, and anyone calling the program directly would walk past it. A mint is",
        "unambiguous, and a flag on a mint is enforceable.",
        "",
        "The judgement that a token misrepresents someone is inherently off-chain for",
        "the same reason — the claim being judged is a string in metadata. So this",
        "records *that* a decision was taken and by whom, and leaves the deciding to",
        "people. What it buys is that the decision then binds the program."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "disavowedBy",
            "docs": [
              "Who flagged it — the authority or a guardian."
            ],
            "type": "pubkey"
          },
          {
            "name": "reason",
            "docs": [
              "Short machine-readable reason, for the UI to phrase."
            ],
            "type": {
              "defined": {
                "name": "disavowReason"
              }
            }
          },
          {
            "name": "at",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "tokenMetadataArgs",
      "docs": [
        "A launched token's name, symbol and metadata URI.",
        "",
        "One argument rather than three loose strings: they are meaningless apart,",
        "every launch instruction needs all of them, and passing them separately put",
        "two of those instructions over clippy's argument limit. Grouping also means",
        "a future field arrives without changing five signatures again."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "name",
            "type": "string"
          },
          {
            "name": "symbol",
            "type": "string"
          },
          {
            "name": "uri",
            "type": "string"
          }
        ]
      }
    },
    {
      "name": "tradeEvent",
      "docs": [
        "Emitted on every curve trade (buy or sell)."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "user",
            "type": "pubkey"
          },
          {
            "name": "isBuy",
            "type": "bool"
          },
          {
            "name": "solAmount",
            "docs": [
              "Gross SOL spent (buy) or net SOL received (sell), in lamports."
            ],
            "type": "u64"
          },
          {
            "name": "tokenAmount",
            "docs": [
              "Tokens received (buy) or returned (sell), in base units."
            ],
            "type": "u64"
          },
          {
            "name": "fee",
            "type": "u64"
          },
          {
            "name": "virtualSolReserves",
            "type": "u64"
          },
          {
            "name": "virtualTokenReserves",
            "type": "u64"
          },
          {
            "name": "realSolReserves",
            "type": "u64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "traderStats",
      "docs": [
        "Cumulative trading activity for one wallet, across every mechanism —",
        "what perk level-ups are gated on. One per wallet, created on a trader's",
        "first buy/sell/deposit and updated on every one after."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "volumeLamports",
            "docs": [
              "Cumulative SOL moved across buys and sells, all mechanisms (lamports)."
            ],
            "type": "u64"
          },
          {
            "name": "depositsLamports",
            "docs": [
              "Cumulative SOL locked via conviction buys or revenue-share purchases —",
              "counted separately from (and in addition to) volume_lamports since",
              "committing capital is a stronger signal than a single trade."
            ],
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "verification",
      "docs": [
        "On-chain record binding a verified X handle to a wallet and its soulbound",
        "credential NFT. One PDA per subject wallet. The authoritative \"this handle is",
        "really this wallet\" state; the Metaplex Core asset is the user-visible badge."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "subject",
            "docs": [
              "The verified wallet."
            ],
            "type": "pubkey"
          },
          {
            "name": "asset",
            "docs": [
              "The soulbound Metaplex Core asset minted as the credential."
            ],
            "type": "pubkey"
          },
          {
            "name": "handle",
            "docs": [
              "The X handle (without leading @)."
            ],
            "type": "string"
          },
          {
            "name": "verifiedAt",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    }
  ],
  "constants": [
    {
      "name": "curveSeedStr",
      "type": "string",
      "value": "\"curve\""
    },
    {
      "name": "globalSeedStr",
      "type": "string",
      "value": "\"global\""
    }
  ]
};
