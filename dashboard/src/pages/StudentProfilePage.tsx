import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { Box, Card, CardContent, Grid, Typography, Avatar, Divider, Button, Stack } from '@mui/material';
import QRCode from 'qrcode.react';
import { StudentsApi } from '@/api/endpoints';

export function StudentProfilePage() {
  const { id = '' } = useParams();
  const { data: student, isLoading } = useQuery({
    queryKey: ['student', id],
    queryFn: () => StudentsApi.get(id),
    enabled: !!id,
  });

  if (isLoading || !student) return <Typography>Loading…</Typography>;

  const qrPayload = JSON.stringify({
    student_id: student.id, enrollment_no: student.enrollment_no, school_id: student.school_id,
  });

  return (
    <Box>
      <Typography variant="h4" gutterBottom>{student.name}</Typography>
      <Grid container spacing={2}>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Stack alignItems="center" spacing={2}>
                <Avatar src={student.primary_photo_url ?? undefined} sx={{ width: 160, height: 200 }} variant="rounded" />
                <QRCode value={qrPayload} size={144} />
                <Button variant="contained">Generate ID Card</Button>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={8}>
          <Card>
            <CardContent>
              <DetailRow label="Enrollment" value={student.enrollment_no} />
              <DetailRow label="Roll No" value={student.roll_no} />
              <DetailRow label="Father's Name" value={student.father_name} />
              <DetailRow label="Mother's Name" value={student.mother_name} />
              <DetailRow label="DOB" value={student.dob} />
              <DetailRow label="Blood Group" value={student.blood_group} />
              <DetailRow label="Gender" value={student.gender} />
              <DetailRow label="Mobile" value={student.mobile} />
              <DetailRow label="Address" value={student.address} />
              <DetailRow label="Enrolled On" value={student.enrolled_on} />
              <DetailRow label="Status" value={student.status} />
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}

function DetailRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <Box sx={{ py: 1 }}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography>{value ?? '—'}</Typography>
      <Divider sx={{ mt: 1 }} />
    </Box>
  );
}
