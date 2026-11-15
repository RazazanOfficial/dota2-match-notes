// Called inside the same transaction that commits validated local parser output.
// A Match ID can appear in several users' journals; each needs its own images.
export async function enqueueLocalReplayImages(client, matchId) {
  await client.query(`INSERT INTO match_image_jobs(match_id)
    SELECT id FROM journal_matches WHERE dota_match_id=$1
    ON CONFLICT(match_id) DO UPDATE SET status='pending',attempts=0,run_after=now(),
      started_at=NULL,locked_at=NULL,finished_at=NULL,error_code=NULL,error_message=NULL,
      progress_stage='queued',current_image=0,completed_images=0,updated_at=now()
    WHERE match_image_jobs.status<>'processing'`, [matchId]);
}
