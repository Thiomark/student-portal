import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { PortalComponent } from './views/portal/portal.component';
import { TimeTableComponent } from './views/time-table/time-table.component';
import { LoginComponent } from './views/auth/auth.component';

const routes: Routes = [
  {
    path: '', component: PortalComponent
  },
  {
    path: 'student_schedule', component: TimeTableComponent
  },
  {
    path: 'login', component: LoginComponent
  },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
