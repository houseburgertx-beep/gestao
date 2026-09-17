export type Recipient = {id:string;email:string;role:string;unitId:string;active:boolean};
export function recipientsFor(users: Recipient[], event: {kind?:string;unitId?:string}): string[] {
  return [...new Set(users.filter((user) => user.active && (["admin","accountant"].includes(user.role) || (event.kind === "task_created" && user.role === "manager" && user.unitId === event.unitId))).map((user) => user.email))];
}
