/** Adapter boundary so local trigger requests can be exercised with a mocked native scheduler. */
export async function dispatchLocalNotificationRequest<Request, Identifier extends string>(
  schedule: (request: Request) => Promise<Identifier>,
  request: Request,
): Promise<Identifier> {
  return schedule(request);
}
