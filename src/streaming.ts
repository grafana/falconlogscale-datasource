import { LogScaleQuery } from "types";

/**
 * Calculate a unique key for the query.  The key is used to pick a channel and should
 * be unique for each distinct query execution plan.  This key is not secure and is only picked to avoid
 * possible collisions
 */
export async function getLiveStreamKey(query: LogScaleQuery): Promise<string> {
    // note from andrew: there was a incident with live queries leaking cached data. i believe the icident had to do with
    // this str not being secure. we probably should include the tenant id in this
    const str = JSON.stringify({ expr: query.lsql, repo: query.repository });

    const msgUint8 = new TextEncoder().encode(str); // encode as (utf-8) Uint8Array
    const hashBuffer = await crypto.subtle.digest('SHA-1', msgUint8); // hash the message
    const hashArray = Array.from(new Uint8Array(hashBuffer.slice(0, 8))); // first 8 bytes
    return `${query.datasource?.uid}/${hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')}`;//add org id
}
