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
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "maxPrice",
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
        "Claim a token's accrued creator fees \u2014 gated on the creator being",
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
            "claim \u2014 an unverified creator cannot construct a valid transaction, which",
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
          "name": "owner",
          "relations": [
            "genesis"
          ]
        }
      ],
      "args": []
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
            "staleness-validated \u2014 a single `owner =` constraint can't accept either",
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
        }
      ]
    },
    {
      "name": "levelUp",
      "docs": [
        "Level up a perk NFT: rewrites its on-chain Attributes and raises its fee",
        "discount (program-controlled via the perk authority PDA)."
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
          "name": "authority",
          "docs": [
            "Protocol keeper triggering the level-up (e.g. on volume milestones)."
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
            "rejects the transfer unless `creator` is the current owner \u2014 the same",
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
            "The subject token's bonding curve \u2014 gates issuance to its creator."
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
      "name": "reclaimNftAuction",
      "docs": [
        "Return an unsold 1-of-1 to its lister once the auction window closes.",
        "Without this an expired auction locks the NFT in escrow permanently \u2014",
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
            "Pays the transaction. Reclaiming is permissionless \u2014 the asset can only",
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
          "name": "mint",
          "relations": [
            "pool"
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
        "Verify an X handle\u2194wallet binding against a Solana Attestation Service",
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
            "Pays for the credential accounts. Can be anyone (subject or a relayer) \u2014",
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
      "name": "priceAboveMax",
      "msg": "Current price exceeds the bidder's maximum"
    },
    {
      "code": 6010,
      "name": "insufficientPosition",
      "msg": "Position holds fewer tokens than requested"
    },
    {
      "code": 6011,
      "name": "noStakers",
      "msg": "No shares staked to receive the deposit"
    },
    {
      "code": 6012,
      "name": "insufficientShares",
      "msg": "Not enough shares remain for sale"
    },
    {
      "code": 6013,
      "name": "unauthorized",
      "msg": "Caller is not authorized"
    },
    {
      "code": 6014,
      "name": "invalidHandle",
      "msg": "Handle is empty or too long"
    },
    {
      "code": 6015,
      "name": "maxLevelReached",
      "msg": "Perk is already at max level"
    },
    {
      "code": 6016,
      "name": "invalidAttestation",
      "msg": "Attestation account is invalid or malformed"
    },
    {
      "code": 6017,
      "name": "attestationExpired",
      "msg": "Attestation has expired"
    },
    {
      "code": 6018,
      "name": "invalidTreasury",
      "msg": "Treasury must be a System-owned account"
    },
    {
      "code": 6019,
      "name": "invalidFeed",
      "msg": "Invalid or unparseable Switchboard feed"
    },
    {
      "code": 6020,
      "name": "staleFeed",
      "msg": "Switchboard feed is stale or has too few samples"
    },
    {
      "code": 6021,
      "name": "noCreatorFees",
      "msg": "No creator fees available to claim"
    },
    {
      "code": 6022,
      "name": "notReadyToGraduate",
      "msg": "Curve has not reached the graduation threshold"
    },
    {
      "code": 6023,
      "name": "insufficientActivity",
      "msg": "Not enough trading volume or deposits to reach the next perk level"
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
              "Trading-fee discount granted, in basis points."
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
