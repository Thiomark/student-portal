import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { PortalComponent } from './views/portal/portal.component';
import { TimeTableComponent } from './views/time-table/time-table.component';
import { LoginComponent, ResetPasswordComponent } from './views/auth/auth.component';
import { MyprofileComponent } from './views/myprofile/myprofile.component';
import { MymodulesComponent } from './views/mymodules/mymodules.component';
import { ModuleComponent } from './views/module/module.component';
import { CalenderComponent } from './views/calender/calender.component';

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
  {
    path: 'my_profile', component: MyprofileComponent
  },
  {
    path: 'reset_passwrd', component: ResetPasswordComponent
  },
  {
    path: 'my_modules', component: MymodulesComponent
  },
  {
    path: 'module/web123', component: ModuleComponent
  },
  {
    path: 'calender', component: CalenderComponent
  },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
