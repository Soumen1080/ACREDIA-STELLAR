import { supabase } from './supabase';
import { uploadToIPFS, uploadJSONToIPFS, getIPFSUrl } from './ipfs';
import {
    issueCredentialOnStellar,
    generateCredentialHash,
    revokeCredentialOnStellar,
} from './contracts';
import { CREDENTIAL_HASH_ALGORITHM, CREDENTIAL_METADATA_SCHEMA_VERSION } from './credentialHash';
import { buildAcrediaVerifiableCredential, type AcrediaVerifiableCredential } from './verifiableCredential';
import { validateVerifiableCredential } from './schemas';
import { runtimeConfig } from './runtimeConfig';
import { debugLog, captureException, recordMetric } from './debug';
import { getE2eState, updateE2eState } from './e2e';

export interface Subject {
    id: string;
    name: string;
    marks: string;
    maxMarks: string;
    grade?: string;
}

export interface CredentialData {
    studentName: string;
    studentWallet: string;
    studentEmail?: string;
    credentialType: string;
    degree: string;
    major?: string;
    gpa?: string;
    issueDate: string;
    subjects?: Subject[];
    institutionId: string;
    institutionName: string;
    institutionWallet: string;
    file: File;
}

/**
 * Credential metadata is modeled as a W3C Verifiable Credential / Open
 * Badges 3.0 JSON-LD document (see verifiableCredential.ts). This alias is
 * kept so existing imports of `CredentialMetadata` from this module keep
 * working.
 */
export type CredentialMetadata = AcrediaVerifiableCredential;

export type CredentialIssueProgressStep = 'upload-ipfs' | 'sign-transaction' | 'save-database';

export async function issueCredential(
    data: CredentialData,
    issuerAddress: string,
    onProgress?: (step: CredentialIssueProgressStep) => void,
): Promise<{
    tokenId: string;
    transactionHash: string;
    ipfsHash: string;
    metadataHash: string;
}> {
    const e2eState = getE2eState();
    if (e2eState?.enabled) {
        onProgress?.('upload-ipfs');
        const fileCID = `e2e-file-${data.file.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`;
        const metadataPath = 'e2e-metadata-cid';
        const tokenId = String(e2eState.nextTokenId ?? 1);
        const transactionHash = `e2e-tx-${tokenId}`;

        updateE2eState((state) => {
            state.nextTokenId = (state.nextTokenId ?? 1) + 1;
            state.issuedCredentials ??= [];
            state.issuedCredentials.unshift({
                id: `cred-${tokenId}`,
                token_id: tokenId,
                ipfs_hash: metadataPath,
                blockchain_hash: transactionHash,
                metadata: {
                    credentialData: {
                        studentName: data.studentName,
                        degree: data.degree,
                        major: data.major,
                        gpa: data.gpa,
                        issueDate: data.issueDate,
                        credentialType: data.credentialType,
                    },
                },
                issued_at: new Date().toISOString(),
                revoked: false,
                issuer_wallet_address: data.institutionWallet,
                student_wallet_address: data.studentWallet,
            });
            if (state.stats) {
                state.stats.totalCredentials += 1;
                state.stats.activeCredentials += 1;
            }
        });

        onProgress?.('save-database');

        return {
            tokenId,
            transactionHash,
            ipfsHash: fileCID,
            metadataHash: metadataPath,
        };
    }

    try {
        onProgress?.('upload-ipfs');
        debugLog('Uploading credential file to IPFS.');
        const fileCID = await uploadToIPFS(data.file);
        const fileUrl = getIPFSUrl(fileCID);
        debugLog('Credential file uploaded to IPFS.');

        debugLog('Generating credential metadata as a W3C VC / Open Badges 3.0 document.');
        const metadata: CredentialMetadata = buildAcrediaVerifiableCredential(
            {
                studentName: data.studentName,
                studentWallet: data.studentWallet,
                degree: data.degree,
                major: data.major,
                gpa: data.gpa,
                issueDate: data.issueDate,
                credentialType: data.credentialType,
                institutionName: data.institutionName,
                institutionWallet: data.institutionWallet,
                subjects: data.subjects,
            },
            runtimeConfig.stellar.explorerBaseUrl,
            fileUrl,
        );
        validateVerifiableCredential(metadata);

        debugLog('Uploading credential metadata to IPFS.');
        const metadataPath = await uploadJSONToIPFS(metadata);
        const metadataUrl = `ipfs://${metadataPath}`;
        debugLog('Credential metadata uploaded to IPFS.');

        debugLog('Generating credential hash.');
        const credentialHash = await generateCredentialHash(metadata);
        debugLog('Credential hash generated.');

        debugLog('Issuing credential on Stellar network.');
        onProgress?.('sign-transaction');
        const { tokenId, transactionHash } = await issueCredentialOnStellar(
            data.studentWallet,
            credentialHash,
            metadataUrl,
            issuerAddress,
        );
        // eslint-disable-next-line no-console
        console.log('✅ Credential issued! Token ID:', tokenId);
        // eslint-disable-next-line no-console
        console.log('✅ Transaction:', transactionHash);

        // Step 5: (Skipped) Registry handled atomically by Stellar contract

        // Step 6: Save to Supabase database
        // eslint-disable-next-line no-console
        console.log('💾 Saving to database...');

        if (!data.institutionId) {
            throw new Error('Missing institution ID. Please refresh and try again.');
        }

        debugLog('Saving issued credential to the database.');
        onProgress?.('save-database');
        const { data: studentData } = await supabase
            .from('students')
            .select('id')
            .eq('wallet_address', data.studentWallet)
            .maybeSingle();

        const { error: dbError } = await supabase.from('credentials').insert({
            student_id: studentData?.id || null,
            student_wallet_address: data.studentWallet,
            institution_id: data.institutionId,
            issuer_wallet_address: data.institutionWallet, // Store issuer wallet
            token_id: tokenId,
            ipfs_hash: metadataPath, // Store full path (CID/filename)
            blockchain_hash: transactionHash,
            metadata,
            metadata_schema_version: CREDENTIAL_METADATA_SCHEMA_VERSION,
            hash_algorithm: CREDENTIAL_HASH_ALGORITHM,
            issued_at: new Date().toISOString(),
            revoked: false,
        });

        if (dbError) {
            captureException(dbError, { context: 'db_save_credential' });
            const details = [dbError.code, dbError.message, dbError.details]
                .filter(Boolean)
                .join(' | ');
            throw new Error(
                `Failed to save credential to database: ${details || 'Unknown database error'}`,
            );
        }

        debugLog('Credential saved to the database.');
        recordMetric('issuance.success', 1, {
            credentialType: data.credentialType,
            institutionId: data.institutionId,
        });

        // Trigger transactional email
        fetch('/api/notifications/trigger', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'issued', tokenId }),
        }).catch((err) => captureException(err, { context: 'triggerIssuedEmail' }));

        return {
            tokenId,
            transactionHash,
            ipfsHash: fileCID,
            metadataHash: metadataPath,
        };
    } catch (error) {
        recordMetric('issuance.failure', 1, {
            credentialType: data.credentialType,
            institutionId: data.institutionId,
        });
        captureException(error, { context: 'issueCredential_service' });
        throw error;
    }
}

export async function getInstitutionCredentials(institutionId: string) {
    try {
        const { data, error } = await supabase
            .from('credentials')
            .select('*')
            .eq('institution_id', institutionId)
            .order('issued_at', { ascending: false });

        if (error) throw error;

        return data;
    } catch (error) {
        captureException(error, { context: 'getInstitutionCredentials_service' });
        throw error;
    }
}

export async function getCredentialById(credentialId: string) {
    try {
        const { data, error } = await supabase
            .from('credentials')
            .select('*')
            .eq('id', credentialId)
            .single();

        if (error) throw error;

        return data;
    } catch (error) {
        captureException(error, { context: 'getCredentialById_service' });
        throw error;
    }
}

export async function revokeCredentialById(
    credentialId: string,
    issuerAddress: string,
): Promise<void> {
    const e2eState = getE2eState();
    if (e2eState?.enabled) {
        updateE2eState((state) => {
            const credential = state.issuedCredentials?.find((entry) => entry.id === credentialId);
            if (!credential) {
                throw new Error('Credential not found');
            }

            if (credential.revoked) {
                throw new Error('Credential is already revoked');
            }

            credential.revoked = true;
            credential.blockchain_hash = credential.blockchain_hash || `e2e-revoke-${credential.token_id}`;
            if (state.stats) {
                state.stats.activeCredentials = Math.max(0, state.stats.activeCredentials - 1);
            }
        });
        return;
    }

    try {
        const credential = await getCredentialById(credentialId);
        if (!credential) {
            throw new Error('Credential not found');
        }

        if (credential.revoked) {
            throw new Error('Credential is already revoked');
        }

        const connectedWallet = issuerAddress?.toLowerCase();
        const storedIssuerWallet = credential.issuer_wallet_address?.toLowerCase();

        debugLog('Validating wallet authorization for credential revocation.');

        if (!connectedWallet) {
            throw new Error('No wallet connected. Please connect your wallet first.');
        }

        if (connectedWallet !== storedIssuerWallet) {
            throw new Error(
                `Authorization failed: You must use the same wallet that issued this credential.\n` +
                    `Expected: ${storedIssuerWallet}\n` +
                    `Connected: ${connectedWallet}`,
            );
        }

        if (credential.token_id) {
            await revokeCredentialOnStellar(credential.token_id, issuerAddress);
            debugLog('Credential revoked on Stellar network.');
        }

        const { error } = await supabase
            .from('credentials')
            .update({
                revoked: true,
                revoked_at: new Date().toISOString(),
            })
            .eq('id', credentialId);

        if (error) throw error;

        debugLog('Credential revocation saved to the database.');
    } catch (error) {
        captureException(error, { context: 'revokeCredentialById_service' });
        throw error;
    }
}

// ─── Paginated functions for Issue #82 ───────────────────────────────────────

export interface PaginationParams {
  page: number;
  pageSize: number;
}

export interface CredentialFilters {
  search?: string;
  status?: 'active' | 'revoked' | 'all';
  dateFrom?: string;
  dateTo?: string;
}

export interface PaginatedResult {
  data: unknown[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export async function getInstitutionCredentialsPaginated(
  institutionId: string,
  pagination: PaginationParams,
  filters: CredentialFilters = {}
): Promise<PaginatedResult> {
  const { page, pageSize } = pagination;
  const offset = (page - 1) * pageSize;

  let query = supabase
    .from('credentials')
    .select('*', { count: 'exact' })
    .eq('institution_id', institutionId)
    .order('issued_at', { ascending: false });

  if (filters.status && filters.status !== 'all') {
    query = query.eq('revoked', filters.status === 'revoked');
  }
  if (filters.dateFrom) {
    query = query.gte('issued_at', filters.dateFrom);
  }
  if (filters.dateTo) {
    query = query.lte('issued_at', filters.dateTo + 'T23:59:59Z');
  }
  if (filters.search?.trim()) {
    const term = filters.search.trim();
    query = query.or(
      `token_id.ilike.%${term}%,` +
      `metadata->credentialData->>studentName.ilike.%${term}%,` +
      `metadata->credentialData->>degree.ilike.%${term}%,` +
      `metadata->credentialData->>credentialType.ilike.%${term}%`
    );
  }

  query = query.range(offset, offset + pageSize - 1);

  const { data, error, count } = await query;
  if (error) throw new Error(error.message ?? String(error));

  return {
    data: data ?? [],
    total: count ?? 0,
    page,
    pageSize,
    totalPages: Math.ceil((count ?? 0) / pageSize),
  };
}

export async function getStudentCredentialsPaginated(
  studentId: string,
  pagination: PaginationParams,
  filters: CredentialFilters = {}
): Promise<PaginatedResult> {
  const { page, pageSize } = pagination;
  const offset = (page - 1) * pageSize;

  let query = supabase
    .from('credentials')
    .select('*', { count: 'exact' })
    .eq('student_id', studentId)
    .order('issued_at', { ascending: false });

  if (filters.status && filters.status !== 'all') {
    query = query.eq('revoked', filters.status === 'revoked');
  }
  if (filters.dateFrom) {
    query = query.gte('issued_at', filters.dateFrom);
  }
  if (filters.dateTo) {
    query = query.lte('issued_at', filters.dateTo + 'T23:59:59Z');
  }
  if (filters.search?.trim()) {
    const term = filters.search.trim();
    query = query.or(
      `metadata->credentialData->>institutionName.ilike.%${term}%,` +
      `metadata->credentialData->>credentialType.ilike.%${term}%,` +
      `metadata->credentialData->>degree.ilike.%${term}%,` +
      `token_id.ilike.%${term}%`
    );
  }

  query = query.range(offset, offset + pageSize - 1);

  const { data, error, count } = await query;
  if (error) throw new Error(error.message ?? String(error));

  return {
    data: data ?? [],
    total: count ?? 0,
    page,
    pageSize,
    totalPages: Math.ceil((count ?? 0) / pageSize),
  };
}
