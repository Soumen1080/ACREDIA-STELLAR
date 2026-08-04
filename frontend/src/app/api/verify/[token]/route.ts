import { NextRequest, NextResponse } from 'next/server';
import { getServiceRoleClient } from '@/lib/serverAuth';
import {
    getCredential,
    isAuthorizedIssuer,
    isRevoked,
    ContractConfigurationError,
    BlockchainUnavailableError,
} from '@/lib/contractReads';
import { deriveCredentialHash } from '@/lib/credentialHash';
import { fetchJsonFromIpfs } from '@/lib/ipfsServer';
import { enforceRateLimit } from '@/lib/rateLimit';
import {
    writeVerificationAuditLog,
    type VerificationResultType,
} from '@/lib/verificationAudit';
import { captureException, recordMetric } from '@/lib/debug';
import { hashApiKey } from '@/lib/apiKey';

export type IntegrityStatus = 'match' | 'mismatch' | 'unavailable';

export interface IntegrityResult {
    status: IntegrityStatus;
    cidResolved: boolean;
}

export const dynamic = 'force-dynamic';

const MAX_TOKEN_LENGTH = 128;

const VERIFY_RATE_LIMIT = {
    windowSeconds: 60,
    maxRequests: 10,
    prefix: 'verify',
} as const;

type ServiceRoleClient = ReturnType<typeof getServiceRoleClient>;

type ChainChecks = {
    issuerMatch: boolean | null;
    studentMatch: boolean | null;
    hashMatch: boolean | null;
    uriMatch: boolean | null;
    notRevoked: boolean;
};

// Removed unused getErrorMessage

function getMismatchReasons(checks: ChainChecks | null) {
    if (!checks) {
        return ['missing_on_chain'];
    }

    const reasons: string[] = [];
    if (checks.issuerMatch !== true) reasons.push('issuer');
    if (checks.studentMatch !== true) reasons.push('student');
    if (checks.hashMatch !== true) reasons.push('hash');
    if (checks.uriMatch !== true) reasons.push('uri');
    if (!checks.notRevoked) reasons.push('revocation');
    return reasons;
}

function getResultType(verified: boolean, revoked: boolean): VerificationResultType {
    if (verified) {
        return 'verified';
    }

    if (revoked) {
        return 'revoked';
    }

    return 'mismatch';
}

/**
 * Independently confirms that the CID the contract actually points to
 * (`onChainUri`) resolves and that its content hashes to the same value as
 * the on-chain `credential_hash`. This is deliberately separate from
 * `checks.hashMatch` above, which only proves the *database's cached copy*
 * of the metadata matches the chain — it says nothing about whether the
 * document a real verifier would fetch from IPFS is the same bytes. See
 * ACREDIA-STELLAR#163.
 */
async function checkIntegrity(
    onChainUri: string | null | undefined,
    onChainHash: string | null | undefined,
    metadataSchemaVersion: number | null | undefined,
    hashAlgorithm: string | null | undefined,
): Promise<IntegrityResult> {
    if (!onChainUri || !onChainHash) {
        return { status: 'unavailable', cidResolved: false };
    }

    const fetched = await fetchJsonFromIpfs(onChainUri);
    if (!fetched.ok) {
        return { status: 'unavailable', cidResolved: false };
    }

    try {
        const fetchedHash = await deriveCredentialHash(
            fetched.content,
            metadataSchemaVersion,
            hashAlgorithm,
        );
        return {
            status: fetchedHash === onChainHash ? 'match' : 'mismatch',
            cidResolved: true,
        };
    } catch {
        // Content resolved but isn't a canonicalizable document for the
        // recorded schema version — can't be judged authentic or tampered.
        return { status: 'unavailable', cidResolved: true };
    }
}

async function logVerificationAttempt(
    supabase: ServiceRoleClient | null,
    request: NextRequest,
    token: string | null,
    resultType: VerificationResultType,
    statusCode: number,
    options: {
        credentialId?: string | null;
        chain?: {
            found?: boolean;
            revoked?: boolean;
            match?: boolean;
        };
        integrity?: IntegrityResult;
        mismatchReasons?: string[];
        errorCategory?: string;
        apiKeyContext?: { id: string; name: string } | null;
    } = {},
) {
    recordMetric('verification.attempt', 1, {
        resultType,
        statusCode,
        credentialId: options.credentialId,
        chain: options.chain,
        integrityStatus: options.integrity?.status,
        errorCategory: options.errorCategory,
    });

    if (!supabase || !token) {
        return;
    }

    await writeVerificationAuditLog(supabase, {
        request,
        token,
        resultType,
        statusCode,
        credentialId: options.credentialId,
        chain: options.chain,
        integrity: options.integrity,
        mismatchReasons: options.mismatchReasons,
        errorCategory: options.errorCategory,
        apiKeyContext: options.apiKeyContext,
    });
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ token: string }> },
) {
    const requestId = request.headers.get('x-request-id') || 'unknown';
    let supabase: ServiceRoleClient | null = null;
    let token: string | null = null;
    let credentialId: string | null = null;
    let apiKeyContext: { id: string; name: string } | null = null;

    try {
        const { token: rawToken } = await params;
        token = rawToken?.trim() || null;

        if (!token) {
            return NextResponse.json(
                { success: false, error: 'Token is required' },
                { status: 400 },
            );
        }

        try {
            supabase = getServiceRoleClient();
        } catch {
            supabase = null;
        }

        if (!supabase) {
            return NextResponse.json(
                { success: false, error: 'Server configuration error' },
                { status: 500 },
            );
        }

        const authHeader = request.headers.get('authorization');
        const xApiKey = request.headers.get('x-api-key');
        let providedKey = xApiKey?.trim();
        if (!providedKey && authHeader?.toLowerCase().startsWith('bearer ')) {
            providedKey = authHeader.substring(7).trim();
        }

        if (providedKey && supabase) {
            const keyHash = await hashApiKey(providedKey);
            const { data: keyData, error: keyError } = await supabase
                .from('api_keys')
                .select('id, name, revoked')
                .eq('key_hash', keyHash)
                .maybeSingle();

            if (keyError) {
                return NextResponse.json(
                    { success: false, error: 'Database error validating API key' },
                    { status: 500 }
                );
            }

            if (!keyData || keyData.revoked) {
                return NextResponse.json(
                    { success: false, error: 'Invalid or revoked API key' },
                    { status: 401 }
                );
            }
            
            apiKeyContext = { id: keyData.id, name: keyData.name };
        }

        const rateLimitResponse = await enforceRateLimit(request, {
            ...VERIFY_RATE_LIMIT,
            identifier: apiKeyContext ? apiKeyContext.id : undefined,
        });

        if (rateLimitResponse) {
            return rateLimitResponse;
        }

        if (token.length > MAX_TOKEN_LENGTH) {
            await logVerificationAttempt(supabase, request, token, 'invalid_request', 400, {
                errorCategory: 'token_too_long',
            });

            return NextResponse.json(
                { success: false, error: 'Invalid token' },
                { status: 400 },
            );
        }

        const { data, error } = await supabase
            .from('credentials')
            .select(
                `
                id,
                token_id,
                issued_at,
                revoked,
                revoked_at,
                metadata,
                metadata_schema_version,
                hash_algorithm,
                ipfs_hash,
                blockchain_hash,
                student_wallet_address,
                issuer_wallet_address,
                institution:institutions!credentials_institution_id_fkey (
                    name
                )
            `,
            )
            .eq('token_id', token)
            .maybeSingle();

        if (error) {
            await logVerificationAttempt(supabase, request, token, 'server_error', 500, {
                errorCategory: 'database_query_failed',
                apiKeyContext,
            });

            return NextResponse.json(
                { success: false, error: 'Failed to query credential' },
                { status: 500 },
            );
        }

        if (!data) {
            await logVerificationAttempt(supabase, request, token, 'not_found', 404, { apiKeyContext });

            return NextResponse.json(
                { success: false, error: 'Credential not found' },
                { status: 404 },
            );
        }

        credentialId = data.id;

        const [onChain, onChainRevoked, issuerAuthorized] = await Promise.all([
            getCredential(data.token_id),
            isRevoked(data.token_id),
            data.issuer_wallet_address && typeof isAuthorizedIssuer === 'function'
                ? isAuthorizedIssuer(data.issuer_wallet_address)
                : Promise.resolve(false),
        ]);

        const dbHash = data.metadata
            ? await deriveCredentialHash(
                  data.metadata,
                  data.metadata_schema_version,
                  data.hash_algorithm,
              )
            : null;
        const expectedUri = data.ipfs_hash ? `ipfs://${data.ipfs_hash}` : null;

        const checks: ChainChecks | null = onChain
            ? {
                  issuerMatch: data.issuer_wallet_address
                      ? onChain.issuer.toLowerCase() === data.issuer_wallet_address.toLowerCase()
                      : null,
                  studentMatch: data.student_wallet_address
                      ? onChain.student.toLowerCase() === data.student_wallet_address.toLowerCase()
                      : null,
                  hashMatch: dbHash ? onChain.hash === dbHash : null,
                  uriMatch: expectedUri ? onChain.uri === expectedUri : null,
                  notRevoked: !onChainRevoked,
              }
            : null;

        const onChainMatch =
            checks !== null &&
            checks.issuerMatch === true &&
            checks.studentMatch === true &&
            checks.hashMatch === true &&
            checks.uriMatch === true;

        const revoked = Boolean(onChainRevoked || data.revoked);
        const verified = onChain !== null && onChainMatch && !revoked;
        const resultType = getResultType(verified, revoked);

        // Recompute the hash of the document actually fetched from IPFS (not
        // the database's cached copy) and compare it to the on-chain hash —
        // proves the CID resolves *and* that its content is what was
        // anchored, independent of `checks.hashMatch` above.
        const integrity = await checkIntegrity(
            onChain?.uri,
            onChain?.hash,
            data.metadata_schema_version,
            data.hash_algorithm,
        );

        const mismatchReasons = [
            ...(resultType === 'mismatch' ? getMismatchReasons(checks) : []),
            ...(integrity.status === 'mismatch' ? ['ipfs_integrity'] : []),
        ];

        await logVerificationAttempt(supabase, request, token, resultType, 200, {
            credentialId,
            chain: {
                found: onChain !== null,
                revoked,
                match: onChainMatch,
            },
            integrity,
            mismatchReasons,
            apiKeyContext,
        });

        const institution = Array.isArray(data.institution)
            ? data.institution[0]
            : data.institution;

        const credentialData = data.metadata?.credentialData ?? {};

        return NextResponse.json({
            success: true,
            credential: {
                tokenId: data.token_id,
                issuedAt: data.issued_at,
                revoked,
                revokedAt: data.revoked_at,
                institutionName: institution?.name ?? credentialData.institutionName ?? null,
                credentialType: credentialData.credentialType ?? null,
                degree: credentialData.degree ?? null,
                major: credentialData.major ?? null,
                issueDate: credentialData.issueDate ?? null,
                // Stellar account addresses, not sensitive: already readable
                // on-chain by anyone who queries this token_id directly.
                studentWallet: onChain?.student ?? data.student_wallet_address ?? null,
                institutionWallet: onChain?.issuer ?? data.issuer_wallet_address ?? null,
                metadataSchemaVersion: data.metadata_schema_version ?? null,
                hashAlgorithm: data.hash_algorithm ?? null,
                onChainHash: onChain?.hash ?? null,
                blockchainHash: data.blockchain_hash ?? null,
                ipfsHash: data.ipfs_hash ?? null,
            },
            verification: {
                verified,
                revoked,
                onChainMatch,
                onChainFound: onChain !== null,
                issuerAuthorized,
                issuerStatus: issuerAuthorized ? 'active' : 'revoked',
                // Distinct from `revoked`/`onChainFound`: proves the actual
                // IPFS-hosted document — not the DB's cached copy — hashes to
                // the on-chain value. 'unavailable' means the CID couldn't be
                // resolved/checked, not that anything is wrong.
                integrity,
            },
        });
    } catch (err: unknown) {
        if (err instanceof ContractConfigurationError) {
            captureException(err, { requestId, context: 'GET /api/verify/[token]' });
            await logVerificationAttempt(supabase, request, token, 'chain_unavailable', 500, {
                credentialId,
                errorCategory: 'contract_configuration',
                apiKeyContext,
            });

            return NextResponse.json(
                { success: false, error: 'Server configuration error' },
                { status: 500 },
            );
        }

        if (err instanceof BlockchainUnavailableError) {
            captureException(err, { requestId, context: 'GET /api/verify/[token]' });
            await logVerificationAttempt(supabase, request, token, 'chain_unavailable', 503, {
                credentialId,
                errorCategory: 'contract_read_failed',
                apiKeyContext,
            });

            return NextResponse.json(
                { success: false, error: 'Blockchain verification unavailable' },
                { status: 503 },
            );
        }

        await logVerificationAttempt(supabase, request, token, 'server_error', 500, {
            credentialId,
            errorCategory: 'unexpected_error',
            apiKeyContext,
        });
        captureException(err, { requestId, context: 'GET /api/verify/[token]' });

        return NextResponse.json(
            { success: false, error: 'Internal server error' },
            { status: 500 },
        );
    }
}
