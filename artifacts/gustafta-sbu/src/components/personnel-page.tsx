import { PersonnelList } from '@/components/personnel-list';
import { PersonnelDetail } from '@/components/personnel-detail';

export default function PersonnelPage({ expectedUserId, canOwnCases, id }: { expectedUserId: string; canOwnCases: boolean; id?: string }) {
  return id ? <PersonnelDetail key={`${expectedUserId}:${id}`} id={id} expectedUserId={expectedUserId} canOwnCases={canOwnCases} /> : <PersonnelList key={expectedUserId} canOwnCases={canOwnCases} />;
}
