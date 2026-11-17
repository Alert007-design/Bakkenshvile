-- Stories: ny status 'venter' i story_log (Instagram-beholder, der ikke var
-- færdig, da kørslen gav slip. Den udgives ved næste timekørsel).
--
-- Eneste ændring: reglen (CHECK) på kolonnen status tillader nu også 'venter'.
-- Ingen rækker slettes eller ændres, og der kommer ingen nye kolonner. Beholderens
-- id gemmes i den eksisterende kolonne meta_id. Ét samlet kald, så der ikke er
-- et øjeblik uden regel, og det kan køres flere gange uden skade.
--
-- Status: i_gang -> lagt | fejl | venter. venter -> lagt | fejl | venter.
-- 'kladde' = billedet er lavet, men intet er lagt op.

ALTER TABLE story_log
  DROP CONSTRAINT IF EXISTS story_log_status_check,
  ADD CONSTRAINT story_log_status_check
    CHECK (status IN ('i_gang','lagt','fejl','kladde','venter'));
