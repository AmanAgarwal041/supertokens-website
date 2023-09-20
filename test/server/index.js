/* Copyright (c) 2020, VRAI Labs and/or its affiliates. All rights reserved.
 *
 * This software is licensed under the Apache License, Version 2.0 (the
 * "License") as published by the Apache Software Foundation.
 *
 * You may not use this file except in compliance with the License. You may
 * obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations
 * under the License.
 */
let SuperTokens = require("supertokens-node");
let SuperTokensRaw = require("supertokens-node/lib/build/supertokens").default;
let SessionRecipeRaw = require("supertokens-node/lib/build/recipe/session/recipe").default;
let Querier = require("supertokens-node/lib/build/querier").Querier;
let NormalisedURLPath = require("supertokens-node/lib/build/normalisedURLPath").default;
let Session = require("supertokens-node/recipe/session");
let express = require("express");
let cookieParser = require("cookie-parser");
let bodyParser = require("body-parser");
let http = require("http");
let cors = require("cors");
let {
    startST,
    stopST,
    killAllST,
    setupST,
    cleanST,
    setKeyValueInConfig,
    maxVersion,
    isProtectedPropName
} = require("./utils");
let { package_version } = require("../../lib/build/version");
let { middleware, errorHandler } = require("supertokens-node/framework/express");
let { verifySession } = require("supertokens-node/recipe/session/framework/express");

let MultiTenancyRecipeRaw;
try {
    MultiTenancyRecipeRaw = require("supertokens-node/lib/build/recipe/multitenancy/recipe").default;
} catch {
    // Ignored
}

let noOfTimesRefreshCalledDuringTest = 0;
let noOfTimesGetSessionCalledDuringTest = 0;
let noOfTimesRefreshAttemptedDuringTest = 0;
let supertokens_node_version = require("supertokens-node/lib/build/version").version;

let urlencodedParser = bodyParser.urlencoded({ limit: "20mb", extended: true, parameterLimit: 20000 });
let jsonParser = bodyParser.json({ limit: "20mb" });

let app = express();
app.use(urlencodedParser);
app.use(jsonParser);
app.use(cookieParser());

let lastSetEnableAntiCSRF = false;
let lastSetEnableJWT = false;
let accountLinkingSupported = maxVersion(supertokens_node_version, "15.0") === supertokens_node_version;

function getConfig(enableAntiCsrf, enableJWT, jwtPropertyName) {
    if (enableJWT && maxVersion(supertokens_node_version, "14.0") === supertokens_node_version) {
        return {
            appInfo: {
                appName: "SuperTokens",
                apiDomain: "0.0.0.0:" + (process.env.NODE_PORT === undefined ? 8080 : process.env.NODE_PORT),
                websiteDomain: "http://localhost.org:8080"
            },
            supertokens: {
                connectionURI: "http://localhost:9000"
            },
            recipeList: [
                Session.init({
                    getTokenTransferMethod: process.env.TRANSFER_METHOD ? () => process.env.TRANSFER_METHOD : undefined,
                    exposeAccessTokenToFrontendInCookieBasedAuth: true,
                    errorHandlers: {
                        onUnauthorised: (err, req, res) => {
                            res.setStatusCode(401);
                            res.sendJSONResponse({});
                        }
                    },
                    antiCsrf: enableAntiCsrf ? "VIA_TOKEN" : "NONE",
                    override: {
                        apis: oI => {
                            return {
                                ...oI,
                                refreshPOST: undefined
                            };
                        },
                        functions: function (oI) {
                            return {
                                ...oI,
                                createNewSession: async function (input) {
                                    input.accessTokenPayload = {
                                        ...input.accessTokenPayload,
                                        customClaim: "customValue"
                                    };

                                    return await oI.createNewSession(input);
                                }
                            };
                        }
                    }
                })
            ]
        };
    }

    if (maxVersion(supertokens_node_version, "8.3") === supertokens_node_version && enableJWT) {
        return {
            appInfo: {
                appName: "SuperTokens",
                apiDomain: "0.0.0.0:" + (process.env.NODE_PORT === undefined ? 8080 : process.env.NODE_PORT),
                websiteDomain: "http://localhost.org:8080"
            },
            supertokens: {
                connectionURI: "http://localhost:9000"
            },
            recipeList: [
                Session.init({
                    getTokenTransferMethod: process.env.TRANSFER_METHOD ? () => process.env.TRANSFER_METHOD : undefined,
                    jwt: {
                        enable: true,
                        propertyNameInAccessTokenPayload: jwtPropertyName
                    },
                    errorHandlers: {
                        onUnauthorised: (err, req, res) => {
                            res.setStatusCode(401);
                            res.sendJSONResponse({});
                        }
                    },
                    antiCsrf: enableAntiCsrf ? "VIA_TOKEN" : "NONE",
                    override: {
                        apis: oI => {
                            return {
                                ...oI,
                                refreshPOST: undefined
                            };
                        },
                        functions: function (oI) {
                            return {
                                ...oI,
                                createNewSession: async function (input) {
                                    input.accessTokenPayload = {
                                        ...input.accessTokenPayload,
                                        customClaim: "customValue"
                                    };

                                    return await oI.createNewSession(input);
                                }
                            };
                        }
                    }
                })
            ]
        };
    }

    return {
        appInfo: {
            appName: "SuperTokens",
            apiDomain: "0.0.0.0:" + (process.env.NODE_PORT === undefined ? 8080 : process.env.NODE_PORT),
            websiteDomain: "http://localhost.org:8080"
        },
        supertokens: {
            connectionURI: "http://localhost:9000"
        },
        recipeList: [
            Session.init({
                getTokenTransferMethod: process.env.TRANSFER_METHOD ? () => process.env.TRANSFER_METHOD : undefined,
                errorHandlers: {
                    onUnauthorised: (err, req, res) => {
                        res.setStatusCode(401);
                        res.sendJSONResponse({});
                    }
                },
                antiCsrf: enableAntiCsrf ? "VIA_TOKEN" : "NONE",
                override: {
                    apis: oI => {
                        return {
                            ...oI,
                            refreshPOST: undefined
                        };
                    }
                }
            })
        ]
    };
}

SuperTokens.init(getConfig(true, false));

app.use(
    cors({
        origin: "http://localhost.org:8080",
        allowedHeaders: ["content-type", ...SuperTokens.getAllCORSHeaders()],
        methods: ["GET", "PUT", "POST", "DELETE"],
        credentials: true
    })
);

app.use(middleware());

app.post("/login", async (req, res) => {
    let userId = req.body.userId;
    let session =
        MultiTenancyRecipeRaw !== undefined
            ? await Session.createNewSession(
                  req,
                  res,
                  "public",
                  accountLinkingSupported ? SuperTokens.convertToRecipeUserId(userId) : userId
              )
            : await Session.createNewSession(req, res, userId);
    res.send(session.getUserId());
});

app.post("/login-2.18", async (req, res) => {
    // This CDI version is no longer supported by this SDK, but we want to ensure that sessions keep working after the upgrade
    // We can hard-code the structure of the request&response, since this is a fixed CDI version and it's not going to change
    Querier.apiVersion = "2.18";
    const payload = req.body.payload || {};
    const userId = req.body.userId;
    const legacySessionResp = await Querier.getNewInstanceOrThrowError().sendPostRequest(
        new NormalisedURLPath("/recipe/session"),
        {
            userId,
            enableAntiCsrf: false,
            userDataInJWT: payload,
            userDataInDatabase: {}
        }
    );
    Querier.apiVersion = undefined;

    const legacyAccessToken = legacySessionResp.accessToken.token;
    const legacyRefreshToken = legacySessionResp.refreshToken.token;

    res.set("st-access-token", legacyAccessToken)
        .set("st-refresh-token", legacyRefreshToken)
        .set(
            "front-token",
            Buffer.from(
                JSON.stringify({
                    uid: userId,
                    ate: Date.now() + 3600000,
                    up: payload
                })
            ).toString("base64")
        )
        .send();
});

app.post("/startST", async (req, res) => {
    let accessTokenValidity = req.body.accessTokenValidity === undefined ? 1 : req.body.accessTokenValidity;
    let enableAntiCsrf = req.body.enableAntiCsrf === undefined ? true : req.body.enableAntiCsrf;
    let enableJWT = req.body.enableJWT === undefined ? false : req.body.enableJWT;

    lastSetEnableAntiCSRF = enableAntiCsrf;
    lastSetEnableJWT = enableJWT;

    await setKeyValueInConfig("access_token_validity", accessTokenValidity);
    if (req.body.accessTokenSigningKeyUpdateInterval !== undefined) {
        await setKeyValueInConfig(
            "access_token_signing_key_update_interval",
            req.body.accessTokenSigningKeyUpdateInterval
        );
    }
    if (enableAntiCsrf !== undefined) {
        SuperTokensRaw.reset();
        SessionRecipeRaw.reset();
        if (MultiTenancyRecipeRaw) {
            MultiTenancyRecipeRaw.reset();
        }
        SuperTokens.init(getConfig(enableAntiCsrf, enableJWT));
    }
    let pid = await startST();
    res.send(pid + "");
});

app.get("/featureFlags", async (req, res) => {
    let currentEnableJWT = lastSetEnableJWT;

    res.status(200).json({
        sessionJwt:
            maxVersion(supertokens_node_version, "8.3") === supertokens_node_version && currentEnableJWT === true,
        sessionClaims: maxVersion(supertokens_node_version, "12.0") === supertokens_node_version,
        v3AccessToken: maxVersion(supertokens_node_version, "14.0") === supertokens_node_version
    });
});

app.post("/reinitialiseBackendConfig", async (req, res) => {
    let currentEnableJWT = lastSetEnableJWT;
    let jwtPropertyName = req.body.jwtPropertyName;

    SuperTokensRaw.reset();
    SessionRecipeRaw.reset();
    if (MultiTenancyRecipeRaw) {
        MultiTenancyRecipeRaw.reset();
    }
    SuperTokens.init(getConfig(lastSetEnableAntiCSRF, currentEnableJWT, jwtPropertyName));

    res.send("");
});

app.post("/beforeeach", async (req, res) => {
    noOfTimesRefreshCalledDuringTest = 0;
    noOfTimesGetSessionCalledDuringTest = 0;
    noOfTimesRefreshAttemptedDuringTest = 0;
    await killAllST();
    await setupST();
    res.send();
});

app.post("/after", async (req, res) => {
    await killAllST();
    await cleanST();
    res.send();
});

app.post("/stopst", async (req, res) => {
    await stopST(req.body.pid);
    res.send("");
});

app.post("/testUserConfig", async (req, res) => {
    res.status(200).send();
});

app.post("/multipleInterceptors", async (req, res) => {
    res.status(200).send(
        req.headers.interceptorheader2 !== undefined && req.headers.interceptorheader1 !== undefined
            ? "success"
            : "failure"
    );
});

app.get(
    "/",
    (req, res, next) => verifySession()(req, res, next),
    async (req, res) => {
        noOfTimesGetSessionCalledDuringTest += 1;
        res.send(req.session.getUserId());
    }
);

app.get(
    "/check-rid",
    (req, res, next) => verifySession()(req, res, next),
    async (req, res) => {
        let response = req.headers["rid"];
        res.send(!response.startsWith("anti-csrf") ? "fail" : "success");
    }
);

app.get("/check-rid-no-session", async (req, res) => {
    let rid = req.headers["rid"];
    res.send(!rid || !rid.startsWith("anti-csrf") ? "fail" : "success");
});

app.get(
    "/update-jwt",
    (req, res, next) => verifySession()(req, res, next),
    async (req, res) => {
        if (req.session.getJWTPayload !== undefined) {
            res.json(req.session.getJWTPayload());
        } else {
            res.json(req.session.getAccessTokenPayload());
        }
    }
);

app.post(
    "/update-jwt",
    (req, res, next) => verifySession()(req, res, next),
    async (req, res) => {
        if (req.session.getJWTPayload !== undefined) {
            await req.session.updateJWTPayload(req.body);
            res.json(req.session.getJWTPayload());
        } else if (req.session.updateAccessTokenPayload) {
            await req.session.updateAccessTokenPayload(req.body);
            res.json(req.session.getAccessTokenPayload());
        } else {
            let clearing = {};

            for (const key of Object.keys(req.session.getAccessTokenPayload())) {
                if (!isProtectedPropName(key)) {
                    clearing[key] = null;
                }
            }
            await req.session.mergeIntoAccessTokenPayload({ ...clearing, ...req.body });
            res.json(req.session.getAccessTokenPayload());
        }
    }
);

app.post(
    "/update-jwt-with-handle",
    (req, res, next) => verifySession()(req, res, next),
    async (req, res) => {
        if (Session.getJWTPayload !== undefined) {
            await Session.updateJWTPayload(req.session.getHandle(), req.body);
            res.json(req.session.getJWTPayload());
        } else if (Session.updateAccessTokenPayload) {
            await Session.updateAccessTokenPayload(req.session.getHandle(), req.body);
            res.json(req.session.getAccessTokenPayload());
        } else {
            const info = await Session.getSessionInformation(req.session.getHandle());
            let clearing = {};

            for (const key of Object.keys(info.customClaimsInAccessTokenPayload)) {
                clearing[key] = null;
            }

            await Session.mergeIntoAccessTokenPayload(req.session.getHandle(), { ...clearing, ...req.body });
            res.json(req.session.getAccessTokenPayload());
        }
    }
);

app.post(
    "/session-claims-error",
    (req, res, next) =>
        verifySession({
            overrideGlobalClaimValidators: () => [
                {
                    id: "test-claim-failing",
                    shouldRefetch: () => false,
                    validate: () => ({ isValid: false, reason: { message: "testReason" } })
                }
            ]
        })(req, res, next),
    async (req, res) => {
        res.json({});
    }
);

app.post("/403-without-body", async (req, res) => {
    res.sendStatus(403);
});

app.use("/testing", async (req, res) => {
    let tH = req.headers["testing"];
    if (tH !== undefined) {
        res.header("testing", tH);
    }
    res.send("success");
});

app.post(
    "/logout",
    (req, res, next) => verifySession()(req, res, next),
    async (req, res) => {
        await req.session.revokeSession();
        res.send("success");
    }
);

app.post(
    "/revokeAll",
    (req, res, next) => verifySession()(req, res, next),
    async (req, res) => {
        let userId = req.session.getUserId();
        await SuperTokens.revokeAllSessionsForUser(userId);
        res.send("success");
    }
);

app.post("/auth/session/refresh", async (req, res, next) => {
    noOfTimesRefreshAttemptedDuringTest += 1;
    verifySession()(req, res, err => {
        if (err) {
            next(err);
        } else {
            if (req.headers["rid"] === undefined) {
                res.send("refresh failed");
            } else {
                refreshCalled = true;
                noOfTimesRefreshCalledDuringTest += 1;
                res.send("refresh success");
            }
        }
    });
});

app.get("/refreshCalledTime", async (req, res) => {
    res.status(200).send("" + noOfTimesRefreshCalledDuringTest);
});

app.get("/refreshAttemptedTime", async (req, res) => {
    res.status(200).send("" + noOfTimesRefreshAttemptedDuringTest);
});

app.get("/getSessionCalledTime", async (req, res) => {
    res.status(200).send("" + noOfTimesGetSessionCalledDuringTest);
});
app.get("/getPackageVersion", async (req, res) => {
    res.status(200).send("" + package_version);
});

app.get("/ping", async (req, res) => {
    res.send("success");
});

app.get("/testHeader", async (req, res) => {
    let testHeader = req.headers["st-custom-header"];
    let success = true;
    if (testHeader === undefined) {
        success = false;
    }
    let data = {
        success
    };
    res.send(JSON.stringify(data));
});

app.post("/checkAllowCredentials", (req, res) => {
    res.send(req.headers["allow-credentials"] !== undefined ? true : false);
});

app.get("/index.html", (req, res) => {
    res.sendFile("index.html", { root: __dirname });
});

app.use("/angular", express.static("./angular"));

app.get("/testError", (req, res) => {
    let code = 500;
    if (req.query.code) {
        code = Number.parseInt(req.query.code);
    }
    res.status(code).send("test error message");
});

app.get("/stop", async (req, res) => {
    process.exit();
});

app.use("*", async (req, res, next) => {
    res.status(404).send();
});

app.use(errorHandler());

app.use(async (err, req, res, next) => {
    res.send(500).send(err);
});

let server = http.createServer(app);
server.listen(process.env.NODE_PORT === undefined ? 8080 : process.env.NODE_PORT, "::");
