import React, { useState, useEffect } from "react";
import { Table, Loader, Message, Segment, Icon, Button } from "semantic-ui-react";
import { observer } from "mobx-react";
import api from "@/api";
import { appState } from "@/appState";
import { useLocalizer, Link } from "@/utils/hooks";
import { SubmissionItem, SubmissionHeader } from "@/pages/submission/componments/SubmissionItem";

interface ProblemSubmissionsTabProps {
  problemId: number;
}

export const ProblemSubmissionsTab: React.FC<ProblemSubmissionsTabProps> = observer(({ problemId }) => {
  const _ = useLocalizer("submissions");
  const [submissions, setSubmissions] = useState<ApiTypes.SubmissionMetaDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSubmissions();
  }, [problemId, appState.currentUser]);

  async function fetchSubmissions() {
    // If user is not logged in, maybe show nothing or prompt? 
    // For now let's query all submissions if user not logged in, or maybe just don't show specific user filter.
    // Actually LeetCode shows "My Submissions". If not logged in, it shows nothing or prompt.
    // Let's filter by current user if logged in.
    
    setLoading(true);
    setError(null);
    try {
      const query: any = {
        problemId: problemId,
        locale: appState.locale,
        takeCount: 20
      };
      
      if (appState.currentUser) {
          query.submitter = appState.currentUser.username;
      }

      const { requestError, response } = await api.submission.querySubmission(query);

      if (requestError) throw new Error(requestError(_));
      if (response.error) throw new Error(response.error);

      setSubmissions(response.submissions || []);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  if (loading && submissions.length === 0) return <Loader active inline="centered" style={{ marginTop: '20px' }} />;
  if (error) return <Message error content={error} />;

  if (submissions.length === 0) {
      return (
          <Segment placeholder basic>
              <div style={{textAlign: 'center'}}>
                 <Icon name="file outline" size="large" />
                 <p>{_(".empty.message_filtered")}</p>
                 {!appState.currentUser && (
                     <p>Please login to see your submissions.</p>
                 )}
              </div>
          </Segment>
      )
  }

  return (
    <div style={{ height: '100%', overflowY: 'auto' }}>
      <Table textAlign="center" basic="very" unstackable fixed compact>
        <Table.Header>
          <SubmissionHeader page="submissions" />
        </Table.Header>
        <Table.Body>
          {submissions.map(submission => (
            <SubmissionItem
              key={submission.id}
              submission={submission}
              page="submissions"
            />
          ))}
        </Table.Body>
      </Table>
    </div>
  );
});
